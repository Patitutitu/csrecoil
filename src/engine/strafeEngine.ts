import { buildStrafeChart, type ChartNote, type StrafeChart } from '@/lib/strafeChart'
import { ACCURATE_SPEED_FRACTION, TICK_MS, type Movement, type StrafeKey } from './movement'
import { comboMultiplier, GRADE_POINTS, runGrade } from './scoring'
import { newId, SprayEngine } from './sprayEngine'
import type { GuideLevel, HitGrade, RunResult, ShotResult, StrafeMode, StrafeStats, WeaponDef } from './types'

export type StrafeEvent =
  | { type: 'start'; t0: number }
  | { type: 'shot'; shot: ShotResult; combo: number; kill: null }
  | { type: 'pop'; label: string; grade: HitGrade }
  | { type: 'finished'; result: RunResult }

export interface StrafeOptions {
  weapon: WeaponDef
  mode: StrafeMode
  guide: GuideLevel
  sensitivity: number
  dpi: number
  seed: number
  movement: Movement
  /** Balas por ventana FIRE en modo burst (tap siempre es 1). */
  bulletsPerWindow?: number
}

/** Tiempo de reacción permitido al empezar una nota antes de exigir la tecla. */
const HOLD_GRACE_MS = 90

export function gradeHold(sync: number): HitGrade {
  if (sync >= 0.9) return 'perfect'
  if (sync >= 0.75) return 'great'
  if (sync >= 0.5) return 'good'
  return 'miss'
}

/** ~80 ms es un counter-strafe limpio; soltar sin contra-tecla tarda ~200 ms. */
export function gradeStop(ms: number): HitGrade {
  if (ms <= 100) return 'perfect'
  if (ms <= 150) return 'great'
  if (ms <= 220) return 'good'
  return 'miss'
}

interface KeyEvent {
  t: number
  key: StrafeKey
  down: boolean
}

interface WindowState {
  note: Extract<ChartNote, { kind: 'fire' }>
  stopMs: number | null
  stopAt: number | null
  counter: boolean
  burst: SprayEngine | null
  firstShotAt: number | null
  judged: boolean
}

export class StrafeEngine {
  readonly weapon: WeaponDef
  readonly mode: StrafeMode
  readonly guide: GuideLevel
  readonly sensitivity: number
  readonly dpi: number
  readonly seed: number
  readonly chart: StrafeChart
  readonly movement: Movement
  readonly game = 'strafe' as const

  status: 'idle' | 'running' | 'finished' = 'idle'
  t0 = 0
  combo = 0
  maxCombo = 0
  shots: ShotResult[] = []
  result: RunResult | null = null
  /** Ráfaga activa o la última disparada (para dibujar el retroceso). */
  burst: SprayEngine | null = null
  windows: WindowState[]
  holdResults: { sync: number; grade: HitGrade }[] = []

  private keyLog: KeyEvent[] = []
  private nextHold = 0
  private earned = 0
  private score = 0

  constructor(opts: StrafeOptions) {
    this.weapon = opts.weapon
    this.mode = opts.mode
    this.guide = opts.guide
    this.sensitivity = opts.sensitivity
    this.dpi = opts.dpi
    this.seed = opts.seed
    this.movement = opts.movement
    this.chart = buildStrafeChart(opts.weapon, opts.mode, opts.seed, opts.bulletsPerWindow ?? 8)
    this.windows = this.fireNotes.map((note) => ({
      note,
      stopMs: null,
      stopAt: null,
      counter: false,
      burst: null,
      firstShotAt: null,
      judged: false,
    }))
    this.movement.onKey((t, key, down) => {
      if (this.status === 'running') this.keyLog.push({ t, key, down })
    })
  }

  get fireNotes(): Extract<ChartNote, { kind: 'fire' }>[] {
    return this.chart.notes.filter((n): n is Extract<ChartNote, { kind: 'fire' }> => n.kind === 'fire')
  }

  get holdNotes(): Extract<ChartNote, { kind: 'hold' }>[] {
    return this.chart.notes.filter((n): n is Extract<ChartNote, { kind: 'hold' }> => n.kind === 'hold')
  }

  get plannedBullets(): number {
    return this.chart.windows * this.chart.bulletsPerWindow
  }

  get cycleMs(): number {
    return this.weapon.cycleMs
  }

  /** Ventana de disparo activa en un instante (relativo al inicio de la canción). */
  windowAt(rel: number): WindowState | null {
    return this.windows.find((w) => rel >= w.note.start && rel < w.note.end) ?? null
  }

  press(t: number): StrafeEvent[] {
    if (this.status === 'idle') {
      this.status = 'running'
      this.t0 = t
      this.keyLog = [
        { t, key: 'a', down: this.movement.keys.a },
        { t, key: 'd', down: this.movement.keys.d },
      ]
      return [{ type: 'start', t0: t }]
    }
    if (this.status !== 'running') return []
    if (this.burst && this.burst.status === 'running') return []
    const w = this.windowAt(t - this.t0)
    if (!w || w.burst) {
      this.breakCombo()
      return [{ type: 'pop', label: 'ESPERÁ LA VENTANA', grade: 'miss' }]
    }
    // Obligatorio: AAAA → disparar es inválido. Tiene que haber counter (AAAADDDD).
    if (!this.hasCounterStrafe(w, t)) {
      this.breakCombo()
      this.award('miss')
      return [{ type: 'pop', label: 'SIN COUNTER · AAAADDDD', grade: 'miss' }]
    }
    w.counter = true
    const burst = new SprayEngine({
      weapon: this.weapon,
      mode: this.mode,
      guide: this.guide,
      sensitivity: this.sensitivity,
      dpi: this.dpi,
      game: 'strafe',
      seed: this.seed,
      movement: this.movement,
      bullets: w.note.bullets,
      group: w.note.window,
    })
    w.burst = burst
    w.firstShotAt = t
    this.burst = burst
    return this.wrapBurst(burst.press(t))
  }

  release(t: number): StrafeEvent[] {
    if (this.burst && this.burst.status === 'running') return this.wrapBurst(this.burst.release(t))
    return []
  }

  move(t: number, dx: number, dy: number): void {
    if (this.burst && this.burst.status === 'running') this.burst.move(t, dx, dy)
  }

  abort(t: number): StrafeEvent[] {
    if (this.status !== 'running') return []
    const events = this.release(t)
    events.push(this.finish(false))
    return events
  }

  update(now: number): StrafeEvent[] {
    if (this.status !== 'running') return []
    const events: StrafeEvent[] = []
    if (this.burst) events.push(...this.wrapBurst(this.burst.update(now)))
    const rel = now - this.t0

    const holds = this.holdNotes
    while (this.nextHold < holds.length && holds[this.nextHold].end <= rel) {
      const n = holds[this.nextHold]
      const sync = this.holdSync(n)
      const grade = gradeHold(sync)
      this.holdResults.push({ sync, grade })
      this.award(grade)
      events.push({ type: 'pop', label: grade === 'miss' ? `${n.key.toUpperCase()} FUERA DE TIEMPO` : `${n.key.toUpperCase()} ${Math.round(sync * 100)}%`, grade })
      this.nextHold += 1
    }

    for (const w of this.windows) {
      // El frenado se mide desde el inicio de la nota COUNTER (fin del hold).
      const counter = this.counterNote(w.note.window)
      const stopFrom = counter?.start ?? w.note.start
      if (rel < stopFrom) continue
      if (w.stopMs === null && !w.judged) {
        const stop = this.findStop(stopFrom, Math.min(rel, w.note.end))
        if (stop !== null) {
          w.stopAt = stop
          w.stopMs = Math.max(0, stop - stopFrom)
          w.counter = this.hasCounterStrafe(w, this.t0 + stop)
          // Sin counter no hay frenado válido: soltar solo A nunca alcanza.
          const grade = w.counter ? gradeStop(w.stopMs) : 'miss'
          this.award(grade)
          events.push({
            type: 'pop',
            label: w.counter ? `COUNTER ${Math.round(w.stopMs)} ms` : 'SIN COUNTER',
            grade,
          })
        }
      }
      if (!w.judged && rel >= w.note.end && (!w.burst || w.burst.status !== 'running')) {
        w.judged = true
        if (w.stopMs === null) {
          this.award('miss')
          events.push({
            type: 'pop',
            label: this.hasCounterStrafe(w, this.t0 + w.note.end) ? 'NO FRENASTE' : 'SIN COUNTER',
            grade: 'miss',
          })
        }
        if (!w.burst) {
          this.breakCombo()
          events.push({ type: 'pop', label: 'NO DISPARASTE', grade: 'miss' })
        } else if (!w.counter) {
          // Disparó sin counter (no debería pasar por el hard-block, pero por si acaso).
          this.breakCombo()
          events.push({ type: 'pop', label: 'SIN COUNTER', grade: 'miss' })
        }
      }
    }

    if (rel >= this.chart.durationMs && this.windows.every((w) => w.judged)) {
      events.push(this.finish(true))
    }
    return events
  }

  private wrapBurst(events: ReturnType<SprayEngine['update']>): StrafeEvent[] {
    const out: StrafeEvent[] = []
    for (const ev of events) {
      if (ev.type !== 'shot') continue
      const shot = { ...ev.shot, multiplier: comboMultiplier(this.combo) }
      this.shots.push(shot)
      this.earned += shot.points
      this.score += shot.points * shot.multiplier
      if (shot.grade === 'miss') this.breakCombo()
      else this.bumpCombo()
      out.push({ type: 'shot', shot, combo: this.combo, kill: null })
    }
    return out
  }

  private award(grade: HitGrade): void {
    const pts = GRADE_POINTS[grade]
    this.earned += pts
    this.score += pts * comboMultiplier(this.combo)
    if (grade === 'miss') this.breakCombo()
    else this.bumpCombo()
  }

  private bumpCombo(): void {
    this.combo += 1
    this.maxCombo = Math.max(this.maxCombo, this.combo)
  }

  private breakCombo(): void {
    this.combo = 0
  }

  /** Primer tick desde `fromRel` en el que la velocidad queda bajo el 34 %. */
  private findStop(fromRel: number, toRel: number): number | null {
    for (let r = fromRel; r <= toRel; r += TICK_MS) {
      if (this.movement.speedFracAt(this.t0 + r) <= ACCURATE_SPEED_FRACTION) return r
    }
    return null
  }

  private counterNote(window: number): Extract<ChartNote, { kind: 'counter' }> | undefined {
    return this.chart.notes.find(
      (n): n is Extract<ChartNote, { kind: 'counter' }> => n.kind === 'counter' && n.window === window,
    )
  }

  private prevHold(window: number): Extract<ChartNote, { kind: 'hold' }> | undefined {
    const counter = this.counterNote(window)
    if (!counter) return undefined
    return this.holdNotes.find((h) => h.end === counter.start)
  }

  /**
   * Counter-strafe real: después del strafe (AAAA) tenés que apretar la tecla opuesta (DDDD).
   * Soltar solo A y disparar no cuenta.
   */
  hasCounterStrafe(w: WindowState, atPerfMs: number): boolean {
    if (w.counter) return true
    const hold = this.prevHold(w.note.window)
    const counter = this.counterNote(w.note.window)
    if (!hold || !counter) return false
    const opposite: StrafeKey = counter.key
    // Ventana: desde un poco antes de la nota counter hasta el momento del disparo/stop.
    const from = this.t0 + counter.start - 120
    const to = atPerfMs + 40
    return this.keyLog.some((k) => k.key === opposite && k.down && k.t >= from && k.t <= to)
  }

  private keyDownAt(key: StrafeKey, t: number): boolean {
    let state = false
    for (const k of this.keyLog) {
      if (k.t > t) break
      if (k.key === key) state = k.down
    }
    return state
  }

  /** Fracción de la nota con la tecla correcta apretada y la contraria suelta. */
  holdSync(n: Extract<ChartNote, { kind: 'hold' }>): number {
    const other: StrafeKey = n.key === 'a' ? 'd' : 'a'
    const from = this.t0 + n.start + HOLD_GRACE_MS
    const to = this.t0 + n.end
    if (to <= from) return 1
    const step = 10
    let ok = 0
    let total = 0
    for (let t = from; t < to; t += step) {
      total += 1
      if (this.keyDownAt(n.key, t) && !this.keyDownAt(other, t)) ok += 1
    }
    return total ? ok / total : 0
  }

  private finish(completed: boolean): StrafeEvent {
    this.status = 'finished'
    const stops = this.windows.map((w) => w.stopMs).filter((v): v is number => v !== null)
    const reactions = this.windows
      .filter((w) => w.firstShotAt !== null && w.stopAt !== null)
      .map((w) => Math.max(0, (w.firstShotAt as number) - this.t0 - (w.stopAt as number)))
    const cleanWindows = this.windows.filter((w) => {
      const shots = this.shots.filter((s) => s.group === w.note.window)
      return w.counter && shots.length === w.note.bullets && shots.every((s) => !s.moving)
    }).length
    const holdSync = this.holdResults.length
      ? this.holdResults.reduce((a, h) => a + h.sync, 0) / this.holdResults.length
      : 0
    const strafe: StrafeStats = {
      windows: this.windows.length,
      cleanWindows,
      meanStopMs: stops.length ? stops.reduce((a, b) => a + b, 0) / stops.length : null,
      stops,
      counterStrafes: this.windows.filter((w) => w.counter).length,
      holdSync,
      movingShots: this.shots.filter((s) => s.moving).length,
      meanReactionMs: reactions.length ? reactions.reduce((a, b) => a + b, 0) / reactions.length : null,
    }
    const maxRaw = GRADE_POINTS.perfect * (this.plannedBullets + this.holdNotes.length + this.windows.length)
    const accuracy = maxRaw ? this.earned / maxRaw : 0
    const last = this.burst
    this.result = {
      id: newId(),
      date: Date.now(),
      game: 'strafe',
      weaponId: this.weapon.id,
      mode: this.mode,
      guide: this.guide,
      bullets: this.plannedBullets,
      shots: this.shots,
      score: Math.round(this.score),
      maxCombo: this.maxCombo,
      accuracy,
      grade: runGrade(accuracy),
      completed,
      sensitivity: this.sensitivity,
      dpi: this.dpi,
      trace: last?.result?.trace ?? [],
      seed: this.seed,
      strafe,
    }
    return { type: 'finished', result: this.result }
  }
}
