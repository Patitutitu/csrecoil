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

/** Margen para reaccionar y disparar quieto después del counter. */
const REACT_AND_FIRE_MS = 280
const MIN_HOLD_MS = 420
/** Duración visual/jugable de la nota de counter (~1 tap). */
const COUNTER_BEATS = 1

/**
 * Partitura: AAAAA → DDDD (counter) → FIRE quieto → DDDDD → AAAA (counter) → FIRE…
 * Nunca se dispara solo después de una tecla: siempre hace falta el counter-strafe.
 */
export function buildStrafeChart(weapon: WeaponDef, mode: StrafeMode, seed: number): StrafeChart {
  const rnd = mulberry32(seed ^ 0x5bd1e995)
  const beatMs = weapon.cycleMs * 4
  const bulletsPerWindow = mode === 'tap' ? 1 : Math.min(4, weapon.magazine)
  const windows = mode === 'tap' ? 10 : 8
  const counterMs = COUNTER_BEATS * beatMs
  const fireBeats = Math.max(1, Math.ceil(((bulletsPerWindow - 1) * weapon.cycleMs + REACT_AND_FIRE_MS) / beatMs))
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
    const counterEnd = holdEnd + counterMs
    notes.push({ kind: 'counter', key: opposite, start: holdEnd, end: counterEnd, window: w })
    const fireEnd = counterEnd + fireBeats * beatMs
    notes.push({ kind: 'fire', start: counterEnd, end: fireEnd, bullets: bulletsPerWindow, window: w })
    t = fireEnd
    key = opposite
  }
  return { beatMs, leadInMs, notes, windows, bulletsPerWindow, durationMs: t + beatMs }
}

export function oppositeKey(key: StrafeKey): StrafeKey {
  return key === 'a' ? 'd' : 'a'
}
