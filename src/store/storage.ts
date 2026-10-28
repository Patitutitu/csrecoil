import { useCallback, useEffect, useState } from 'react'
import type { DrillMode, GuideLevel, RunResult, Settings } from '@/engine/types'

const SETTINGS_KEY = 'cs2-recoil-rhythm:settings'
const HISTORY_KEY = 'cs2-recoil-rhythm:history'
const MAX_HISTORY = 300

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1.0,
  dpi: 800,
  audio: true,
  beat: true,
  volume: 0.6,
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

function readHistory(): RunResult[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as RunResult[]) : []
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
): RunResult | undefined {
  let best: RunResult | undefined
  for (const r of history) {
    if (r.weaponId !== weaponId || r.mode !== mode || r.guide !== guide) continue
    if (!best || r.score > best.score) best = r
  }
  return best
}

export interface BulletStat {
  index: number
  meanError: number
  samples: number
}

/** Error medio por número de bala, para ver en qué tramo del spray se rompe el control. */
export function bulletStats(history: RunResult[], weaponId: string, mode: DrillMode): BulletStat[] {
  const acc = new Map<number, { sum: number; n: number }>()
  for (const r of history) {
    if (r.weaponId !== weaponId || r.mode !== mode) continue
    for (const s of r.shots) {
      const e = acc.get(s.index) ?? { sum: 0, n: 0 }
      e.sum += s.errorDeg
      e.n += 1
      acc.set(s.index, e)
    }
  }
  return [...acc.entries()]
    .map(([index, { sum, n }]) => ({ index, meanError: sum / n, samples: n }))
    .sort((a, b) => a.index - b.index)
}
