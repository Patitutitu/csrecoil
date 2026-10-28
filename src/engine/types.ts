export interface Vec2 {
  x: number
  y: number
}

export interface WeaponDef {
  id: string
  name: string
  short: string
  team: 'T' | 'CT'
  category: 'rifle' | 'smg' | 'lmg'
  /** Disparos por minuto reales del arma. */
  rpm: number
  /** Intervalo real entre balas en milisegundos (cycletime del arma). */
  cycleMs: number
  magazine: number
  /** Velocidad máxima corriendo con el arma en la mano, en unidades de Source por segundo. */
  maxSpeed: number
  source: string
  /** Offset del impacto de cada bala en grados: x = yaw (derecha +), y = pitch (arriba +). */
  pattern: Vec2[]
}

export type GameId = 'recoil' | 'transfer' | 'strafe'
export type RecoilMode = 'first4' | 'first9' | 'full' | 'custom'
export type TransferMode = 't2' | 't3' | 't5'
export type StrafeMode = 'tap' | 'burst'
export type DrillMode = RecoilMode | TransferMode | StrafeMode
export type GuideLevel = 'guided' | 'fade' | 'blind'
export type HitGrade = 'perfect' | 'great' | 'good' | 'miss'
export type RunGrade = 'S' | 'A' | 'B' | 'C' | 'D'

export interface ShotResult {
  index: number
  /** Posición ideal del mouse (compensación + objetivo) en grados en el instante del disparo. */
  target: Vec2
  /** Posición real del mouse en grados en el instante del disparo. */
  actual: Vec2
  /** Dónde pegó la bala, en grados del mundo (el objetivo está en `targetPos`). */
  impact: Vec2
  /** Centro del objetivo de esta bala en grados del mundo. */
  targetPos: Vec2
  errorDeg: number
  grade: HitGrade
  points: number
  multiplier: number
  /** Tiempo del disparo relativo al inicio de la ráfaga. */
  timeMs: number
  /** Velocidad del jugador en el disparo como fracción de la velocidad máxima del arma. */
  speedFrac: number
  /** true si se disparó por encima del umbral de precisión (dispersión por movimiento). */
  moving: boolean
  /** Índice del objetivo (spray transfer) o de la ventana de disparo (strafe). */
  group: number
}

export interface TracePoint {
  t: number
  x: number
  y: number
}

export interface TransferStats {
  targets: number
  kills: number
  /** Impactos por objetivo, en orden. */
  hits: number[]
}

export interface StrafeStats {
  windows: number
  /** Ventanas en las que se disparó la ráfaga completa quieto. */
  cleanWindows: number
  /** Promedio de ms desde que termina la nota hasta quedar por debajo del 34 %. */
  meanStopMs: number | null
  stops: number[]
  counterStrafes: number
  /** 0..1: tiempo con la tecla correcta durante las notas A/D. */
  holdSync: number
  movingShots: number
  /** ms desde que quedaste quieto hasta el primer disparo de cada ventana. */
  meanReactionMs: number | null
}

export interface RunResult {
  id: string
  date: number
  game: GameId
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
  seed: number
  transfer?: TransferStats
  strafe?: StrafeStats
}

export interface Settings {
  sensitivity: number
  dpi: number
  audio: boolean
  beat: boolean
  volume: number
  ghost: boolean
  playerName: string
}
