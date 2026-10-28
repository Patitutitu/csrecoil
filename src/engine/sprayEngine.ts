import { bulletsForMode, compensationPath, dist, mouseDeltaToViewDeg } from '@/lib/units'
import { comboMultiplier, gradeForError, GRADE_POINTS, summarize } from './scoring'
import type { DrillMode, GuideLevel, RunResult, ShotResult, TracePoint, Vec2, WeaponDef } from './types'

export type EngineStatus = 'idle' | 'running' | 'finished'

export type EngineEvent =
  | { type: 'start'; t0: number }
  | { type: 'shot'; shot: ShotResult; combo: number }
  | { type: 'finished'; result: RunResult }

export interface EngineOptions {
  weapon: WeaponDef
  mode: DrillMode
  guide: GuideLevel
  sensitivity: number
  dpi: number
}

const MAX_STORED_TRACE = 400

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Línea de tiempo de una ráfaga. La bala i dispara exactamente en t0 + i * cycleMs,
 * con el cycleMs real del arma: el motor nunca altera la cadencia.
 */
export class SprayEngine {
  readonly weapon: WeaponDef
  readonly mode: DrillMode
  readonly guide: GuideLevel
  readonly sensitivity: number
  readonly dpi: number
  readonly bullets: number
  /** Trayectoria ideal del mouse en grados, una entrada por bala. */
  readonly path: Vec2[]

  status: EngineStatus = 'idle'
  t0 = 0
  pos: Vec2 = { x: 0, y: 0 }
  combo = 0
  nextIndex = 0
  shots: ShotResult[] = []
  result: RunResult | null = null

  private samples: TracePoint[] = []

  constructor(opts: EngineOptions) {
    this.weapon = opts.weapon
    this.mode = opts.mode
    this.guide = opts.guide
    this.sensitivity = opts.sensitivity
    this.dpi = opts.dpi
    this.bullets = bulletsForMode(opts.weapon, opts.mode)
    this.path = compensationPath(opts.weapon, this.bullets)
  }

  get cycleMs(): number {
    return this.weapon.cycleMs
  }

  shotTime(index: number): number {
    return this.t0 + index * this.cycleMs
  }

  /** Duración total de la ráfaga, desde la primera hasta la última bala. */
  get durationMs(): number {
    return (this.bullets - 1) * this.cycleMs
  }

  press(t: number): EngineEvent[] {
    if (this.status !== 'idle') return []
    this.status = 'running'
    this.t0 = t
    this.pos = { x: 0, y: 0 }
    this.samples = [{ t, x: 0, y: 0 }]
    this.shots = []
    this.combo = 0
    this.nextIndex = 0
    return [{ type: 'start', t0: t }, ...this.update(t)]
  }

  move(t: number, dx: number, dy: number): void {
    if (this.status !== 'running') return
    const d = mouseDeltaToViewDeg(dx, dy, this.sensitivity)
    this.pos = { x: this.pos.x + d.x, y: this.pos.y + d.y }
    const last = this.samples[this.samples.length - 1]
    if (last && t < last.t) t = last.t
    this.samples.push({ t, x: this.pos.x, y: this.pos.y })
  }

  release(t: number): EngineEvent[] {
    if (this.status !== 'running') return []
    const events = this.update(t)
    if (this.status === 'running') {
      events.push(this.finish(false))
    }
    return events
  }

  /** Juzga todas las balas cuyo instante ya pasó. Llamar en cada frame. */
  update(now: number): EngineEvent[] {
    if (this.status !== 'running') return []
    const events: EngineEvent[] = []
    while (this.nextIndex < this.bullets && this.shotTime(this.nextIndex) <= now) {
      const shot = this.judge(this.nextIndex)
      this.shots.push(shot)
      if (shot.grade === 'miss') this.combo = 0
      else this.combo += 1
      this.nextIndex += 1
      events.push({ type: 'shot', shot, combo: this.combo })
    }
    if (this.nextIndex >= this.bullets) {
      events.push(this.finish(true))
    }
    return events
  }

  /** Posición ideal del láser en un instante dado (interpolación lineal entre balas). */
  idealAt(t: number): Vec2 {
    const rel = (t - this.t0) / this.cycleMs
    if (rel <= 0) return this.path[0]
    const i = Math.floor(rel)
    if (i >= this.bullets - 1) return this.path[this.bullets - 1]
    const f = rel - i
    const a = this.path[i]
    const b = this.path[i + 1]
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
  }

  /** Posición real del mouse en un instante dado, interpolando el registro de eventos. */
  positionAt(t: number): Vec2 {
    const s = this.samples
    if (s.length === 0) return { x: 0, y: 0 }
    if (t <= s[0].t) return { x: s[0].x, y: s[0].y }
    const last = s[s.length - 1]
    if (t >= last.t) return { x: last.x, y: last.y }
    let lo = 0
    let hi = s.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (s[mid].t <= t) lo = mid
      else hi = mid
    }
    const a = s[lo]
    const b = s[hi]
    const span = b.t - a.t
    const f = span > 0 ? (t - a.t) / span : 0
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
  }

  get trace(): TracePoint[] {
    return this.samples
  }

  private judge(index: number): ShotResult {
    const t = this.shotTime(index)
    const target = this.path[index]
    const actual = this.positionAt(t)
    const errorDeg = dist(actual, target)
    const grade = gradeForError(errorDeg)
    const multiplier = comboMultiplier(this.combo)
    return {
      index,
      target,
      actual,
      errorDeg,
      grade,
      points: GRADE_POINTS[grade],
      multiplier,
      timeMs: t - this.t0,
    }
  }

  private finish(completed: boolean): EngineEvent {
    this.status = 'finished'
    const totals = summarize(this.shots, this.bullets)
    this.result = {
      id: newId(),
      date: Date.now(),
      weaponId: this.weapon.id,
      mode: this.mode,
      guide: this.guide,
      bullets: this.bullets,
      shots: this.shots,
      score: totals.score,
      maxCombo: totals.maxCombo,
      accuracy: totals.accuracy,
      grade: totals.grade,
      completed,
      sensitivity: this.sensitivity,
      dpi: this.dpi,
      trace: thinTrace(this.samples, this.t0),
    }
    return { type: 'finished', result: this.result }
  }
}

function thinTrace(samples: TracePoint[], t0: number): TracePoint[] {
  if (samples.length <= MAX_STORED_TRACE) {
    return samples.map((s) => ({ t: Math.round(s.t - t0), x: round3(s.x), y: round3(s.y) }))
  }
  const step = samples.length / MAX_STORED_TRACE
  const out: TracePoint[] = []
  for (let i = 0; i < MAX_STORED_TRACE; i++) {
    const s = samples[Math.min(samples.length - 1, Math.floor(i * step))]
    out.push({ t: Math.round(s.t - t0), x: round3(s.x), y: round3(s.y) })
  }
  const last = samples[samples.length - 1]
  out.push({ t: Math.round(last.t - t0), x: round3(last.x), y: round3(last.y) })
  return out
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
