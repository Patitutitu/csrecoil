import { bulletsForMode, compensationPath, dist, mouseDeltaToViewDeg } from '@/lib/units'
import { mulberry32 } from '@/lib/random'
import { HITS_TO_KILL, insideHitbox, targetsForMode, transferOffsets, transferTargets } from '@/lib/transfer'
import { ACCURATE_SPEED_FRACTION, type Movement } from './movement'
import { comboMultiplier, gradeForError, GRADE_POINTS, summarize } from './scoring'
import type {
  DrillMode,
  GameId,
  GuideLevel,
  RunResult,
  ShotResult,
  TracePoint,
  TransferMode,
  TransferStats,
  Vec2,
  WeaponDef,
} from './types'

export type EngineStatus = 'idle' | 'running' | 'finished'

export type EngineEvent =
  | { type: 'start'; t0: number }
  | { type: 'shot'; shot: ShotResult; combo: number; kill: number | null }
  | { type: 'finished'; result: RunResult }

export interface EngineOptions {
  weapon: WeaponDef
  mode: DrillMode
  guide: GuideLevel
  sensitivity: number
  dpi: number
  game?: GameId
  seed?: number
  movement?: Movement | null
  /** Fuerza la cantidad de balas (ráfagas del modo strafe / override). */
  bullets?: number
  /** Cantidad elegida en modo custom del spray. */
  customBullets?: number
  /** Grupo de las balas (ventana de disparo en strafe). */
  group?: number
}

export const KILL_BONUS = 150

const MAX_STORED_TRACE = 400

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Dispersión extra al disparar por encima del 34 % de la velocidad máxima: crece de forma
 * lineal hasta la velocidad máxima, como la inaccuracy de movimiento de CS2.
 */
export function movingSpreadDeg(speedFrac: number): number {
  if (speedFrac <= ACCURATE_SPEED_FRACTION) return 0
  const k = Math.min(1, (speedFrac - ACCURATE_SPEED_FRACTION) / (1 - ACCURATE_SPEED_FRACTION))
  return 0.6 + 3.4 * k
}

/**
 * Línea de tiempo de una ráfaga. La bala i dispara exactamente en t0 + i * cycleMs,
 * con el cycleMs real del arma: el motor nunca altera la cadencia.
 */
export class SprayEngine {
  readonly weapon: WeaponDef
  readonly mode: DrillMode
  readonly guide: GuideLevel
  readonly game: GameId
  readonly sensitivity: number
  readonly dpi: number
  readonly bullets: number
  readonly seed: number
  /** Compensación pura del retroceso (sin objetivos). */
  readonly compensation: Vec2[]
  /** Centro del objetivo de cada bala en grados del mundo. */
  readonly offsets: Vec2[]
  /** Trayectoria ideal del mouse en grados, una entrada por bala. */
  readonly path: Vec2[]
  /** Objetivos del spray transfer (vacío en los otros juegos). */
  readonly targets: Vec2[]
  readonly hits: number[]
  readonly group: number
  private readonly movement: Movement | null
  private readonly rnd: () => number

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
    this.game = opts.game ?? 'recoil'
    this.sensitivity = opts.sensitivity
    this.dpi = opts.dpi
    this.seed = opts.seed ?? 1
    this.movement = opts.movement ?? null
    this.group = opts.group ?? 0
    this.rnd = mulberry32(this.seed + this.group * 7919)
    this.bullets = Math.min(
      opts.bullets ?? bulletsForMode(opts.weapon, opts.mode, opts.customBullets),
      opts.weapon.magazine,
    )
    this.compensation = compensationPath(opts.weapon, this.bullets)
    if (this.game === 'transfer') {
      const count = targetsForMode(this.mode as TransferMode, this.weapon)
      this.targets = transferTargets(this.seed, count)
      this.offsets = transferOffsets(this.targets).slice(0, this.bullets)
    } else {
      this.targets = []
      this.offsets = this.compensation.map(() => ({ x: 0, y: 0 }))
    }
    this.hits = this.targets.map(() => 0)
    this.path = this.compensation.map((c, i) => ({ x: c.x + this.offsets[i].x, y: c.y + this.offsets[i].y }))
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
    this.hits.fill(0)
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
      let kill: number | null = null
      if (this.game === 'transfer' && insideHitbox(shot.impact, shot.targetPos)) {
        this.hits[shot.group] += 1
        if (this.hits[shot.group] === HITS_TO_KILL) kill = shot.group
      }
      events.push({ type: 'shot', shot, combo: this.combo, kill })
    }
    if (this.nextIndex >= this.bullets) {
      events.push(this.finish(true))
    }
    return events
  }

  /** Posición ideal del láser en un instante dado (interpolación lineal entre balas). */
  idealAt(t: number): Vec2 {
    return interpolatePath(this.path, (t - this.t0) / this.cycleMs)
  }

  /** Posición real del mouse en un instante dado, interpolando el registro de eventos. */
  positionAt(t: number): Vec2 {
    return interpolateTrace(this.samples, t)
  }

  get trace(): TracePoint[] {
    return this.samples
  }

  /** Objetivo actual del spray transfer (el de la próxima bala). */
  get currentTarget(): number {
    if (this.game !== 'transfer') return 0
    return Math.min(this.targets.length - 1, Math.floor(Math.min(this.nextIndex, this.bullets - 1) / HITS_TO_KILL))
  }

  private judge(index: number): ShotResult {
    const t = this.shotTime(index)
    const target = this.path[index]
    const actual = this.positionAt(t)
    const comp = this.compensation[index]
    const speedFrac = this.movement ? this.movement.speedFracAt(t) : 0
    const moving = speedFrac > ACCURATE_SPEED_FRACTION
    let impact = { x: actual.x - comp.x, y: actual.y - comp.y }
    if (moving) {
      const r = movingSpreadDeg(speedFrac) * Math.sqrt(this.rnd())
      const a = this.rnd() * Math.PI * 2
      impact = { x: impact.x + r * Math.cos(a), y: impact.y + r * Math.sin(a) }
    }
    const targetPos = this.offsets[index]
    const errorDeg = dist(impact, targetPos)
    const grade = moving ? 'miss' : gradeForError(errorDeg)
    const multiplier = comboMultiplier(this.combo)
    return {
      index,
      target,
      actual,
      impact,
      targetPos,
      errorDeg,
      grade,
      points: GRADE_POINTS[grade],
      multiplier,
      timeMs: t - this.t0,
      speedFrac,
      moving,
      group: this.game === 'transfer' ? Math.floor(index / HITS_TO_KILL) : this.group,
    }
  }

  private finish(completed: boolean): EngineEvent {
    this.status = 'finished'
    const totals = summarize(this.shots, this.bullets)
    let transfer: TransferStats | undefined
    let score = totals.score
    if (this.game === 'transfer') {
      const kills = this.hits.filter((h) => h >= HITS_TO_KILL).length
      transfer = { targets: this.targets.length, kills, hits: [...this.hits] }
      score += kills * KILL_BONUS
    }
    this.result = {
      id: newId(),
      date: Date.now(),
      game: this.game,
      weaponId: this.weapon.id,
      mode: this.mode,
      guide: this.guide,
      bullets: this.bullets,
      shots: this.shots,
      score,
      maxCombo: totals.maxCombo,
      accuracy: totals.accuracy,
      grade: totals.grade,
      completed,
      sensitivity: this.sensitivity,
      dpi: this.dpi,
      trace: thinTrace(this.samples, this.t0),
      seed: this.seed,
      transfer,
    }
    return { type: 'finished', result: this.result }
  }
}

export function interpolatePath(path: Vec2[], rel: number): Vec2 {
  if (rel <= 0) return path[0]
  const i = Math.floor(rel)
  if (i >= path.length - 1) return path[path.length - 1]
  const f = rel - i
  const a = path[i]
  const b = path[i + 1]
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
}

export function interpolateTrace(s: TracePoint[], t: number): Vec2 {
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

export function thinTrace(samples: TracePoint[], t0: number): TracePoint[] {
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
