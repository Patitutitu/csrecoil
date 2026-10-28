import type { DrillMode, Vec2, WeaponDef } from '@/engine/types'

/** m_yaw / m_pitch por defecto de CS2: grados por count de mouse a sensibilidad 1. */
export const CS2_DEG_PER_COUNT = 0.022

export function degPerCount(sensitivity: number): number {
  return sensitivity * CS2_DEG_PER_COUNT
}

export function countsToDeg(counts: number, sensitivity: number): number {
  return counts * degPerCount(sensitivity)
}

export function degToCounts(deg: number, sensitivity: number): number {
  return deg / degPerCount(sensitivity)
}

/** Centímetros de mousepad para girar la vista `deg` grados. */
export function degToCm(deg: number, sensitivity: number, dpi: number): number {
  return (degToCounts(deg, sensitivity) / dpi) * 2.54
}

export function cmPer360(sensitivity: number, dpi: number): number {
  return degToCm(360, sensitivity, dpi)
}

/** Convierte el movimiento crudo del mouse (counts) a desplazamiento de la vista en grados. */
export function mouseDeltaToViewDeg(dx: number, dy: number, sensitivity: number): Vec2 {
  const k = degPerCount(sensitivity)
  return { x: dx * k, y: -dy * k }
}

export function bulletsForMode(weapon: WeaponDef, mode: DrillMode): number {
  switch (mode) {
    case 'first4':
      return Math.min(4, weapon.magazine)
    case 'first9':
      return Math.min(9, weapon.magazine)
    case 'full':
      return weapon.magazine
  }
}

/** Trayectoria ideal del mouse en grados: el vector opuesto al patrón de impactos. */
export function compensationPath(weapon: WeaponDef, bullets: number): Vec2[] {
  return weapon.pattern.slice(0, bullets).map((p) => ({ x: -p.x, y: -p.y }))
}

/** Tempo equivalente si cada bala cae en una semicorchea. */
export function bpmForCycle(cycleMs: number): number {
  return 60000 / (cycleMs * 4)
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
