import type { StrafeMode, WeaponDef } from '@/engine/types'
import type { StrafeKey } from '@/engine/movement'
import { mulberry32 } from './random'

export type ChartNote =
  | { kind: 'hold'; key: StrafeKey; start: number; end: number }
  /** Tecla opuesta obligatoria para frenar (counter-strafe). Sin esto no se puede disparar. */
  | { kind: 'counter'; key: StrafeKey; start: number; end: number; window: number }
  | { kind: 'fire'; start: number; end: number; bullets: number; window: number }

export interface StrafeChart {
  beatMs: number
  leadInMs: number
  notes: ChartNote[]
  windows: number
  bulletsPerWindow: number
  durationMs: number
}

/** Margen extra en la ventana FIRE después de la última bala (reacción / soltar click). */
const REACT_AND_FIRE_MS = 280
const MIN_HOLD_MS = 420
/**
 * Nota visual de counter: ~tap corto.
 * En CS2 el counter-strafe frena en ~80 ms; no bloqueamos el FIRE detrás de un beat entero.
 */
const COUNTER_MS = 140

/**
 * Partitura: AAAAA → (counter D + FIRE a la vez) → DDDDD → (counter A + FIRE)…
 * Al soltar el strafe y tocar la tecla opuesta quedás quieto (~80 ms) y ya podés disparar:
 * la ventana FIRE arranca con el counter, no después de esperar 400 ms.
 */
export function buildStrafeChart(
  weapon: WeaponDef,
  mode: StrafeMode,
  seed: number,
  bulletsPerWindow = 8,
): StrafeChart {
  const rnd = mulberry32(seed ^ 0x5bd1e995)
  const beatMs = weapon.cycleMs * 4
  const perWindow =
    mode === 'tap'
      ? 1
      : Math.max(1, Math.min(weapon.magazine, Math.round(bulletsPerWindow)))
  const windows = mode === 'tap' ? 10 : 8
  const fireMs = Math.max(weapon.cycleMs, (perWindow - 1) * weapon.cycleMs + REACT_AND_FIRE_MS)
  const minHoldBeats = Math.max(1, Math.ceil(MIN_HOLD_MS / beatMs))
  const leadInMs = beatMs * 4
  const notes: ChartNote[] = []
  let t = leadInMs
  let key: StrafeKey = rnd() < 0.5 ? 'a' : 'd'
  for (let w = 0; w < windows; w++) {
    const holdBeats = minHoldBeats + Math.floor(rnd() * 3)
    const holdEnd = t + holdBeats * beatMs
    notes.push({ kind: 'hold', key, start: t, end: holdEnd })
    const opposite: StrafeKey = key === 'a' ? 'd' : 'a'
    // Counter y FIRE empiezan juntos: frenás con la opuesta y disparás quieto al toque.
    notes.push({ kind: 'counter', key: opposite, start: holdEnd, end: holdEnd + COUNTER_MS, window: w })
    const fireEnd = holdEnd + fireMs
    notes.push({ kind: 'fire', start: holdEnd, end: fireEnd, bullets: perWindow, window: w })
    t = fireEnd
    key = opposite
  }
  return { beatMs, leadInMs, notes, windows, bulletsPerWindow: perWindow, durationMs: t + beatMs }
}

export function oppositeKey(key: StrafeKey): StrafeKey {
  return key === 'a' ? 'd' : 'a'
}
