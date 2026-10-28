import type { HitGrade, RunGrade, ShotResult } from './types'

/** Umbrales de error angular por bala, en grados. 0.3° ≈ el ancho de una cabeza a ~40 m. */
export const GRADE_THRESHOLDS: Record<Exclude<HitGrade, 'miss'>, number> = {
  perfect: 0.3,
  great: 0.6,
  good: 1.0,
}

export const GRADE_POINTS: Record<HitGrade, number> = {
  perfect: 100,
  great: 70,
  good: 40,
  miss: 0,
}

export const MAX_COMBO_BONUS = 10

export function gradeForError(errorDeg: number): HitGrade {
  if (errorDeg <= GRADE_THRESHOLDS.perfect) return 'perfect'
  if (errorDeg <= GRADE_THRESHOLDS.great) return 'great'
  if (errorDeg <= GRADE_THRESHOLDS.good) return 'good'
  return 'miss'
}

/** Multiplicador por racha: x1.0 sin combo, +0.1 por bala hasta x2.0. */
export function comboMultiplier(comboBefore: number): number {
  return 1 + 0.1 * Math.min(comboBefore, MAX_COMBO_BONUS)
}

export function runGrade(accuracy: number): RunGrade {
  if (accuracy >= 0.95) return 'S'
  if (accuracy >= 0.85) return 'A'
  if (accuracy >= 0.7) return 'B'
  if (accuracy >= 0.5) return 'C'
  return 'D'
}

export interface RunTotals {
  score: number
  accuracy: number
  maxCombo: number
  grade: RunGrade
}

export function summarize(shots: ShotResult[], plannedBullets: number): RunTotals {
  let score = 0
  let raw = 0
  let combo = 0
  let maxCombo = 0
  for (const s of shots) {
    score += s.points * s.multiplier
    raw += s.points
    if (s.grade === 'miss') combo = 0
    else {
      combo += 1
      maxCombo = Math.max(maxCombo, combo)
    }
  }
  const accuracy = plannedBullets > 0 ? raw / (plannedBullets * GRADE_POINTS.perfect) : 0
  return { score: Math.round(score), accuracy, maxCombo, grade: runGrade(accuracy) }
}
