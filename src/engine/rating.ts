import { utcDayKey } from '@/lib/daily'
import type { GameId, RunGrade, RunResult } from './types'

export { utcDayKey }

/** Puntaje de práctica (0–3000) estilo CS Rating: combina precisión reciente, rachas y dominio multi-juego. */
export function practiceRating(history: RunResult[]): number {
  if (!history.length) return 0
  const recent = history.slice(0, 40)
  let acc = 0
  let score = 0
  let sGrades = 0
  const games = new Set<GameId>()
  const weapons = new Set<string>()
  for (const r of recent) {
    acc += r.accuracy
    score += Math.min(1, r.score / 4000)
    if (r.grade === 'S') sGrades += 1
    games.add(r.game)
    weapons.add(r.weaponId)
  }
  const n = recent.length
  const base = (acc / n) * 1800
  const scorePart = (score / n) * 600
  const variety = Math.min(300, games.size * 80 + weapons.size * 25)
  const mastery = Math.min(300, sGrades * 30)
  return Math.round(Math.min(3000, base + scorePart + variety + mastery))
}

export function ratingTier(rating: number): { label: string; color: string } {
  if (rating >= 2500) return { label: 'Global', color: '#fbbf24' }
  if (rating >= 2000) return { label: 'Elite', color: '#e879f9' }
  if (rating >= 1500) return { label: 'Distinguido', color: '#a78bfa' }
  if (rating >= 1000) return { label: 'Profesional', color: '#22d3ee' }
  if (rating >= 500) return { label: 'Competidor', color: '#a3e635' }
  if (rating >= 200) return { label: 'En forma', color: '#94a3b8' }
  return { label: 'Calentamiento', color: '#64748b' }
}

export function gradeColor(g: RunGrade): string {
  switch (g) {
    case 'S':
      return 'text-cyan-300'
    case 'A':
      return 'text-lime-300'
    case 'B':
      return 'text-amber-300'
    case 'C':
      return 'text-orange-300'
    case 'D':
      return 'text-rose-300'
  }
}

export function streakDays(history: RunResult[], today = utcDayKey()): number {
  const days = new Set(history.map((r) => utcDayKey(new Date(r.date))))
  let streak = 0
  const cur = new Date(today + 'T00:00:00Z')
  while (days.has(utcDayKey(cur))) {
    streak += 1
    cur.setUTCDate(cur.getUTCDate() - 1)
  }
  return streak
}
