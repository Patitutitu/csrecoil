/**
 * Movimiento horizontal de CS2 (A/D) con la física de Source a 64 ticks por segundo:
 * fricción con sv_friction 5.2 y sv_stopspeed 80, aceleración con sv_accelerate 5.5.
 * Disparar es preciso solo por debajo del 34 % de la velocidad máxima del arma.
 */
export const SV_ACCELERATE = 5.5
export const SV_FRICTION = 5.2
export const SV_STOPSPEED = 80
export const TICK_MS = 1000 / 64
export const ACCURATE_SPEED_FRACTION = 0.34

export type StrafeKey = 'a' | 'd'

interface SpeedSample {
  t: number
  v: number
}

const HISTORY_MS = 4000

export class Movement {
  readonly maxSpeed: number
  /** Velocidad en unidades/s; positivo = derecha (D). */
  velocity = 0
  keys = { a: false, d: false }
  private simT: number
  private history: SpeedSample[] = []
  private keyListeners: ((t: number, key: StrafeKey, down: boolean) => void)[] = []

  constructor(maxSpeed: number, t = 0) {
    this.maxSpeed = maxSpeed
    this.simT = t
    this.history.push({ t, v: 0 })
  }

  onKey(fn: (t: number, key: StrafeKey, down: boolean) => void): void {
    this.keyListeners.push(fn)
  }

  reset(t: number): void {
    this.velocity = 0
    this.simT = t
    this.history = [{ t, v: 0 }]
  }

  setKey(t: number, key: StrafeKey, down: boolean): void {
    if (this.keys[key] === down) return
    this.advance(t)
    this.keys[key] = down
    for (const fn of this.keyListeners) fn(t, key, down)
  }

  releaseAll(t: number): void {
    this.setKey(t, 'a', false)
    this.setKey(t, 'd', false)
  }

  /** Dirección deseada: -1 izquierda, 1 derecha, 0 ninguna (o ambas teclas a la vez). */
  get wishDir(): number {
    return (this.keys.d ? 1 : 0) - (this.keys.a ? 1 : 0)
  }

  advance(t: number): void {
    while (this.simT + TICK_MS <= t) {
      this.simT += TICK_MS
      this.velocity = stepVelocity(this.velocity, this.wishDir, this.maxSpeed, TICK_MS / 1000)
      this.history.push({ t: this.simT, v: this.velocity })
    }
    const cutoff = t - HISTORY_MS
    if (this.history.length > 2 && this.history[1].t < cutoff) {
      let i = 0
      while (i < this.history.length - 2 && this.history[i + 1].t < cutoff) i++
      this.history.splice(0, i)
    }
  }

  /** Velocidad (valor absoluto) en un instante pasado o presente. */
  speedAt(t: number): number {
    this.advance(t)
    const h = this.history
    if (t <= h[0].t) return Math.abs(h[0].v)
    let lo = 0
    let hi = h.length - 1
    if (t >= h[hi].t) return Math.abs(h[hi].v)
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (h[mid].t <= t) lo = mid
      else hi = mid
    }
    return Math.abs(h[lo].v)
  }

  speedFracAt(t: number): number {
    return this.speedAt(t) / this.maxSpeed
  }

  isAccurateAt(t: number): boolean {
    return this.speedFracAt(t) <= ACCURATE_SPEED_FRACTION
  }
}

/** Un tick de PM_Friction + PM_Accelerate sobre un solo eje. */
export function stepVelocity(v: number, wishDir: number, maxSpeed: number, dt: number): number {
  const speed = Math.abs(v)
  if (speed > 0.1) {
    const control = Math.max(speed, SV_STOPSPEED)
    const drop = control * SV_FRICTION * dt
    const newSpeed = Math.max(0, speed - drop)
    v = speed > 0 ? (v / speed) * newSpeed : 0
  } else {
    v = 0
  }
  if (wishDir !== 0) {
    const current = v * wishDir
    const add = maxSpeed - current
    if (add > 0) {
      const accel = Math.min(SV_ACCELERATE * dt * maxSpeed, add)
      v += accel * wishDir
    }
  }
  return v
}

/** ms que tarda en quedar por debajo del umbral de precisión, desde velocidad máxima. */
export function stopTimeMs(maxSpeed: number, counterStrafe: boolean): number {
  let v = maxSpeed
  let t = 0
  while (Math.abs(v) / maxSpeed > ACCURATE_SPEED_FRACTION && t < 2000) {
    v = stepVelocity(v, counterStrafe ? -1 : 0, maxSpeed, TICK_MS / 1000)
    t += TICK_MS
  }
  return t
}
