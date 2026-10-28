import type { DrillMode, Vec2, WeaponDef } from '@/engine/types'
import { HITS_TO_KILL, targetsForMode } from './transfer'

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

/**
 * FOV horizontal real en pantalla, como CS2/Source (fov_cs = FOV en 4:3, hor+ en widescreen).
 * Con fov 90 y 16:9 da ≈ 106,26°.
 */
export function cs2HorizontalFovDeg(aspect: number, fovSetting = 90): number {
  const half = (fovSetting * Math.PI) / 180 / 2
  const vHalf = Math.atan(Math.tan(half) * (3 / 4))
  return (2 * Math.atan(Math.tan(vHalf) * aspect) * 180) / Math.PI
}

/**
 * Píxeles por grado en el centro de la pantalla a la resolución/FOV de CS2.
 * Es lo que hace que 1° de mira se vea igual que en el juego.
 */
export function pixelsPerDegree(resWidth: number, resHeight: number, fovSetting = 90): number {
  const aspect = resWidth / Math.max(1, resHeight)
  const hFov = cs2HorizontalFovDeg(aspect, fovSetting)
  const f = resWidth / 2 / Math.tan(((hFov / 2) * Math.PI) / 180)
  return f * (Math.PI / 180)
}

/**
 * Escala de dibujo en el canvas: mismos grados que en CS2, escalados al ancho del canvas
 * respecto a tu resolución. `viewZoom` agranda el gráfico para practicar sin cambiar
 * los grados del mouse (1 = tamaño relativo al juego, 2–3 = más legible).
 */
export function displayPixelsPerDegree(
  canvasWidth: number,
  resWidth: number,
  resHeight: number,
  fovSetting = 90,
  viewZoom = 1,
): number {
  const game = pixelsPerDegree(resWidth, resHeight, fovSetting)
  const zoom = Number.isFinite(viewZoom) && viewZoom > 0 ? viewZoom : 1
  return game * (canvasWidth / Math.max(1, resWidth)) * zoom
}

/** Cantidad de balas del ejercicio. En modo `custom` usa `customBullets` (acotado al cargador). */
export function bulletsForMode(weapon: WeaponDef, mode: DrillMode, customBullets = 15): number {
  switch (mode) {
    case 'first4':
      return Math.min(4, weapon.magazine)
    case 'first9':
      return Math.min(9, weapon.magazine)
    case 'full':
      return weapon.magazine
    case 'custom':
      return Math.max(1, Math.min(weapon.magazine, Math.round(customBullets)))
    case 't2':
    case 't3':
    case 't5':
      return targetsForMode(mode, weapon) * HITS_TO_KILL
    case 'tap':
      return 1
    case 'burst':
      return Math.min(4, weapon.magazine)
  }
}

/** Presets rápidos del spray → cantidad de balas (o null = cargador completo). */
export function presetBullets(mode: DrillMode, magazine: number): number | null {
  if (mode === 'first4') return Math.min(4, magazine)
  if (mode === 'first9') return Math.min(9, magazine)
  if (mode === 'full') return magazine
  return null
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
