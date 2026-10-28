import type { TransferMode, Vec2, WeaponDef } from '@/engine/types'
import { mulberry32 } from './random'

/** Impactos al pecho que rompen un objetivo. */
export const HITS_TO_KILL = 4

/**
 * Silueta de un enemigo a ~15 m, en grados relativos al centro del pecho (el punto de mira).
 * Pecho de ~34 cm de ancho y cabeza de ~18 cm.
 */
export const HITBOX = {
  chestHalfWidth: 0.65,
  chestTop: 0.5,
  chestBottom: -1.4,
  headY: 0.95,
  headR: 0.33,
}

export function insideHitbox(impact: Vec2, center: Vec2): boolean {
  const dx = impact.x - center.x
  const dy = impact.y - center.y
  if (Math.abs(dx) <= HITBOX.chestHalfWidth && dy <= HITBOX.chestTop && dy >= HITBOX.chestBottom) return true
  return Math.hypot(dx, dy - HITBOX.headY) <= HITBOX.headR
}

export function targetsForMode(mode: TransferMode, weapon: WeaponDef): number {
  const wanted = mode === 't2' ? 2 : mode === 't3' ? 3 : 5
  return Math.max(1, Math.min(wanted, Math.floor(weapon.magazine / HITS_TO_KILL)))
}

/**
 * Enemigos en línea a la altura de la mira (y = 0), separados entre 2° y 4.5°.
 * El sentido del transfer (izquierda o derecha) también sale del seed.
 */
export function transferTargets(seed: number, count: number): Vec2[] {
  const rnd = mulberry32(seed ^ 0x9e3779b9)
  const dir = rnd() < 0.5 ? -1 : 1
  const out: Vec2[] = [{ x: 0, y: 0 }]
  for (let i = 1; i < count; i++) {
    const gap = 2 + rnd() * 2.5
    out.push({ x: Math.round((out[i - 1].x + dir * gap) * 100) / 100, y: 0 })
  }
  return out
}

/** Centro del objetivo al que va cada bala: 4 balas por enemigo. */
export function transferOffsets(targets: Vec2[]): Vec2[] {
  const out: Vec2[] = []
  for (const t of targets) for (let i = 0; i < HITS_TO_KILL; i++) out.push(t)
  return out
}
