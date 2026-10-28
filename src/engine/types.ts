export interface Vec2 {
  x: number
  y: number
}

export interface WeaponDef {
  id: string
  name: string
  short: string
  team: 'T' | 'CT'
  /** Disparos por minuto reales del arma. */
  rpm: number
  /** Intervalo real entre balas en milisegundos (cycletime del arma). */
  cycleMs: number
  magazine: number
  source: string
  /** Offset del impacto de cada bala en grados: x = yaw (derecha +), y = pitch (arriba +). */
  pattern: Vec2[]
}

export type DrillMode = 'first4' | 'first9' | 'full'
export type GuideLevel = 'guided' | 'fade' | 'blind'
export type HitGrade = 'perfect' | 'great' | 'good' | 'miss'
export type RunGrade = 'S' | 'A' | 'B' | 'C' | 'D'

export interface ShotResult {
  index: number
  /** Posición ideal del mouse (compensación) en grados en el instante del disparo. */
  target: Vec2
  /** Posición real del mouse en grados en el instante del disparo. */
  actual: Vec2
  errorDeg: number
  grade: HitGrade
  points: number
  multiplier: number
  /** Tiempo del disparo relativo al inicio de la ráfaga. */
  timeMs: number
}

export interface TracePoint {
  t: number
  x: number
  y: number
}

export interface RunResult {
  id: string
  date: number
  weaponId: string
  mode: DrillMode
  guide: GuideLevel
  bullets: number
  shots: ShotResult[]
  score: number
  maxCombo: number
  /** 0..1, independiente del combo. */
  accuracy: number
  grade: RunGrade
  completed: boolean
  sensitivity: number
  dpi: number
  trace: TracePoint[]
}

export interface Settings {
  sensitivity: number
  dpi: number
  audio: boolean
  beat: boolean
  volume: number
}
