import type { StrafeMode, WeaponDef } from '@/engine/types'
import type { StrafeKey } from '@/engine/movement'
import { mulberry32 } from './random'

export type ChartNote =
  | { kind: 'hold'; key: StrafeKey; start: number; end: number }
  | { kind: 'fire'; start: number; end: number; bullets: number; window: number }

export interface StrafeChart {
  beatMs: number
  leadInMs: number
  notes: ChartNote[]
  windows: number
  bulletsPerWindow: number
  durationMs: number
}

/** Margen para frenar (~80 ms con counter-strafe) y reaccionar antes del primer disparo. */
const STOP_AND_REACT_MS = 350
const MIN_HOLD_MS = 420

/**
 * Partitura del modo strafe a tempo del arma (1 tiempo = 4 balas): notas sostenidas de A o D
 * para moverte y, entre ellas, una ventana sin teclas para frenar y disparar quieto.
 */
export function buildStrafeChart(weapon: WeaponDef, mode: StrafeMode, seed: number): StrafeChart {
  const rnd = mulberry32(seed ^ 0x5bd1e995)
  const beatMs = weapon.cycleMs * 4
  const bulletsPerWindow = mode === 'tap' ? 1 : Math.min(4, weapon.magazine)
  const windows = mode === 'tap' ? 10 : 8
  const fireBeats = Math.max(1, Math.ceil(((bulletsPerWindow - 1) * weapon.cycleMs + STOP_AND_REACT_MS) / beatMs))
  const minHoldBeats = Math.max(1, Math.ceil(MIN_HOLD_MS / beatMs))
  const leadInMs = beatMs * 4
  const notes: ChartNote[] = []
  let t = leadInMs
  let key: StrafeKey = rnd() < 0.5 ? 'a' : 'd'
  for (let w = 0; w < windows; w++) {
    const holdBeats = minHoldBeats + Math.floor(rnd() * 3)
    const holdEnd = t + holdBeats * beatMs
    notes.push({ kind: 'hold', key, start: t, end: holdEnd })
    const fireEnd = holdEnd + fireBeats * beatMs
    notes.push({ kind: 'fire', start: holdEnd, end: fireEnd, bullets: bulletsPerWindow, window: w })
    t = fireEnd
    key = key === 'a' ? 'd' : 'a'
  }
  return { beatMs, leadInMs, notes, windows, bulletsPerWindow, durationMs: t + beatMs }
}
