import { useCallback, useEffect, useState } from 'react'
import type { DrillMode, GameId, GuideLevel, RunResult, Settings } from '@/engine/types'

const SETTINGS_KEY = 'cs2-recoil-rhythm:settings'
const HISTORY_KEY = 'cs2-recoil-rhythm:history'
const MAX_HISTORY = 400

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1.0,
  dpi: 800,
  audio: true,
  beat: true,
  volume: 0.6,
  ghost: true,
  playerName: 'Player',
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...(JSON.parse(raw) as T) }
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // almacenamiento lleno o deshabilitado: la sesión sigue funcionando en memoria
  }
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(() => readJson(SETTINGS_KEY, DEFAULT_SETTINGS))
  useEffect(() => writeJson(SETTINGS_KEY, settings), [settings])
  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), [])
  return [settings, update]
}

function migrateRun(raw: Record<string, unknown>): RunResult | null {
  if (!raw || typeof raw !== 'object') return null
  const shots = Array.isArray(raw.shots) ? raw.shots : []
  const migratedShots = shots.map((s: Record<string, unknown>, i: number) => {
    const target = (s.target as { x: number; y: number }) ?? { x: 0, y: 0 }
    const actual = (s.actual as { x: number; y: number }) ?? { x: 0, y: 0 }
    const impact =
      (s.impact as { x: number; y: number }) ??
      ({ x: actual.x - target.x, y: actual.y - target.y } as { x: number; y: number })
    // impact relativo al target del mouse no es mundo; para legacy usamos error en target
    const targetPos = (s.targetPos as { x: number; y: number }) ?? { x: 0, y: 0 }
    return {
      index: typeof s.index === 'number' ? s.index : i,
      target,
      actual,
      impact: s.impact ? impact : { x: actual.x - target.x, y: actual.y - target.y },
      targetPos,
      errorDeg: typeof s.errorDeg === 'number' ? s.errorDeg : 0,
      grade: (s.grade as RunResult['shots'][0]['grade']) ?? 'miss',
      points: typeof s.points === 'number' ? s.points : 0,
      multiplier: typeof s.multiplier === 'number' ? s.multiplier : 1,
      timeMs: typeof s.timeMs === 'number' ? s.timeMs : 0,
      speedFrac: typeof s.speedFrac === 'number' ? s.speedFrac : 0,
      moving: Boolean(s.moving),
      group: typeof s.group === 'number' ? s.group : 0,
    }
  })
  return {
    id: String(raw.id ?? `${Date.now()}`),
    date: typeof raw.date === 'number' ? raw.date : Date.now(),
    game: (raw.game as GameId) ?? 'recoil',
    weaponId: String(raw.weaponId ?? 'ak47'),
    mode: (raw.mode as DrillMode) ?? 'first4',
    guide: (raw.guide as GuideLevel) ?? 'guided',
    bullets: typeof raw.bullets === 'number' ? raw.bullets : migratedShots.length,
    shots: migratedShots,
    score: typeof raw.score === 'number' ? raw.score : 0,
    maxCombo: typeof raw.maxCombo === 'number' ? raw.maxCombo : 0,
    accuracy: typeof raw.accuracy === 'number' ? raw.accuracy : 0,
    grade: (raw.grade as RunResult['grade']) ?? 'D',
    completed: Boolean(raw.completed ?? true),
    sensitivity: typeof raw.sensitivity === 'number' ? raw.sensitivity : 1,
    dpi: typeof raw.dpi === 'number' ? raw.dpi : 800,
    trace: Array.isArray(raw.trace) ? (raw.trace as RunResult['trace']) : [],
    seed: typeof raw.seed === 'number' ? raw.seed : 0,
    transfer: raw.transfer as RunResult['transfer'],
    strafe: raw.strafe as RunResult['strafe'],
  }
}

function readHistory(): RunResult[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((r) => migrateRun(r as Record<string, unknown>)).filter((r): r is RunResult => r !== null)
  } catch {
    return []
  }
}

export function useHistory(): {
  history: RunResult[]
  addRun: (run: RunResult) => void
  clear: () => void
} {
  const [history, setHistory] = useState<RunResult[]>(readHistory)
  const addRun = useCallback((run: RunResult) => {
    setHistory((h) => {
      const next = [run, ...h].slice(0, MAX_HISTORY)
      writeJson(HISTORY_KEY, next)
      return next
    })
  }, [])
  const clear = useCallback(() => {
    setHistory([])
    writeJson(HISTORY_KEY, [])
  }, [])
  return { history, addRun, clear }
}

export function bestRun(
  history: RunResult[],
  weaponId: string,
  mode: DrillMode,
  guide: GuideLevel,
  game: GameId = 'recoil',
  bullets?: number,
): RunResult | undefined {
  let best: RunResult | undefined
  for (const r of history) {
    if (r.weaponId !== weaponId || r.mode !== mode || r.guide !== guide || r.game !== game) continue
    // En custom, el récord es por cantidad de balas (12 ≠ 20).
    if (mode === 'custom' && bullets !== undefined && r.bullets !== bullets) continue
    if (!best || r.score > best.score) best = r
  }
  return best
}

export interface BulletStat {
  index: number
  meanError: number
  meanDx: number
  meanDy: number
  samples: number
}

/** Error medio por número de bala, para ver en qué tramo del spray se rompe el control. */
export function bulletStats(history: RunResult[], weaponId: string, mode: DrillMode, game: GameId = 'recoil'): BulletStat[] {
  const acc = new Map<number, { sum: number; dx: number; dy: number; n: number }>()
  for (const r of history) {
    if (r.weaponId !== weaponId || r.mode !== mode || r.game !== game) continue
    for (const s of r.shots) {
      const e = acc.get(s.index) ?? { sum: 0, dx: 0, dy: 0, n: 0 }
      e.sum += s.errorDeg
      e.dx += s.actual.x - s.target.x
      e.dy += s.actual.y - s.target.y
      e.n += 1
      acc.set(s.index, e)
    }
  }
  return [...acc.entries()]
    .map(([index, { sum, dx, dy, n }]) => ({
      index,
      meanError: sum / n,
      meanDx: dx / n,
      meanDy: dy / n,
      samples: n,
    }))
    .sort((a, b) => a.index - b.index)
}
