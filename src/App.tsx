import { useCallback, useEffect, useMemo, useState } from 'react'
import { Crosshair, Volume2, VolumeX } from 'lucide-react'
import { Controls } from '@/components/Controls'
import { MetaPanel } from '@/components/MetaPanel'
import { PlayArea } from '@/components/PlayArea'
import { ResultsPanel } from '@/components/ResultsPanel'
import { SettingsDialog } from '@/components/SettingsDialog'
import { StatsPanel } from '@/components/StatsPanel'
import { WeaponInfo } from '@/components/WeaponInfo'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { WEAPONS } from '@/data/weapons'
import { audioEngine } from '@/engine/audio'
import type { DrillMode, GameId, GuideLevel, RecoilMode, RunResult, WeaponDef } from '@/engine/types'
import { defaultMode, GAMES, GUIDES, modesForGame } from '@/lib/drills'
import { dailyChallenge, utcDayKey } from '@/lib/daily'
import { bulletsForMode } from '@/lib/units'
import { bestRun, useHistory, useSettings } from '@/store/storage'

const SESSION_KEY = 'cs2-recoil-rhythm:session'

interface SessionState {
  weaponId: string
  mode: DrillMode
  guide: GuideLevel
  game: GameId
  /** Balas del modo custom (1..magazine). */
  customBullets: number
  seed?: number
  daily?: string
}

function readSession(): SessionState {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) {
      const s = JSON.parse(raw) as Partial<SessionState>
      const game = GAMES.some((g) => g.id === s.game) ? (s.game as GameId) : 'recoil'
      const modes = modesForGame(game)
      const weaponId = WEAPONS.some((w) => w.id === s.weaponId) ? (s.weaponId as string) : WEAPONS[0].id
      const mag = WEAPONS.find((w) => w.id === weaponId)?.magazine ?? 30
      const customBullets =
        typeof s.customBullets === 'number' && s.customBullets >= 1
          ? Math.min(mag, Math.round(s.customBullets))
          : 15
      return {
        weaponId,
        mode: modes.some((m) => m.id === s.mode) ? (s.mode as DrillMode) : modes[0].id,
        guide: GUIDES.some((g) => g.id === s.guide) ? (s.guide as GuideLevel) : 'guided',
        game,
        customBullets,
        seed: typeof s.seed === 'number' ? s.seed : undefined,
        daily: typeof s.daily === 'string' ? s.daily : undefined,
      }
    }
  } catch {
    // sin sesión previa
  }
  // Challenge link ?d=YYYY-MM-DD
  try {
    const params = new URLSearchParams(window.location.search)
    const day = params.get('d')
    if (day) {
      const c = dailyChallenge(day)
      return {
        weaponId: c.weaponId,
        mode: c.mode,
        guide: c.guide,
        game: c.game,
        customBullets: 15,
        seed: c.seed,
        daily: c.day,
      }
    }
  } catch {
    // ignore
  }
  return { weaponId: WEAPONS[0].id, mode: 'first4', guide: 'guided', game: 'recoil', customBullets: 15 }
}

export default function App() {
  const [settings, updateSettings] = useSettings()
  const { history, addRun, clear } = useHistory()
  const [session, setSession] = useState<SessionState>(readSession)
  const [retryToken, setRetryToken] = useState(0)
  const [lastResult, setLastResult] = useState<RunResult | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [warmup, setWarmup] = useState<{ steps: SessionState[]; i: number } | null>(null)

  const weapon = WEAPONS.find((w) => w.id === session.weaponId) ?? WEAPONS[0]
  const { mode, guide, game, customBullets } = session
  const activeBullets = bulletsForMode(weapon, mode, customBullets)

  useEffect(() => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } catch {
      // ignorar
    }
  }, [session])

  const patchSession = useCallback((fn: (s: SessionState) => SessionState) => {
    setSession(fn)
    setLastResult(null)
  }, [])

  const setWeapon = useCallback(
    (w: WeaponDef) =>
      patchSession((s) => ({
        ...s,
        weaponId: w.id,
        customBullets: Math.min(w.magazine, s.customBullets),
        seed: undefined,
        daily: undefined,
      })),
    [patchSession],
  )
  const setMode = useCallback(
    (m: DrillMode) => patchSession((s) => ({ ...s, mode: m, seed: undefined, daily: undefined })),
    [patchSession],
  )
  const setCustomBullets = useCallback(
    (n: number) =>
      patchSession((s) => {
        const mag = WEAPONS.find((w) => w.id === s.weaponId)?.magazine ?? 30
        const bullets = Math.max(1, Math.min(mag, Math.round(n)))
        // En Spray, cambiar balas implica modo custom. En Strafe se queda en burst/tap.
        if (s.game === 'recoil') {
          return { ...s, mode: 'custom' as DrillMode, customBullets: bullets, seed: undefined, daily: undefined }
        }
        if (s.game === 'strafe' && s.mode === 'tap') {
          return { ...s, mode: 'burst' as DrillMode, customBullets: bullets, seed: undefined, daily: undefined }
        }
        return { ...s, customBullets: bullets, seed: undefined, daily: undefined }
      }),
    [patchSession],
  )
  const setGuide = useCallback(
    (g: GuideLevel) => patchSession((s) => ({ ...s, guide: g, seed: undefined, daily: undefined })),
    [patchSession],
  )
  const setGame = useCallback(
    (g: GameId) =>
      patchSession((s) => ({
        ...s,
        game: g,
        mode: defaultMode(g),
        seed: undefined,
        daily: undefined,
      })),
    [patchSession],
  )

  const onFinished = useCallback(
    (r: RunResult) => {
      setLastResult(r)
      addRun(r)
      if (warmup) {
        const next = warmup.i + 1
        if (next < warmup.steps.length) {
          setTimeout(() => {
            setWarmup({ ...warmup, i: next })
            setSession(warmup.steps[next])
            setRetryToken((t) => t + 1)
            setLastResult(null)
          }, 900)
        } else {
          setWarmup(null)
        }
      }
    },
    [addRun, warmup],
  )

  const best = bestRun(history, weapon.id, mode, guide, game, activeBullets)
  const daily = useMemo(() => dailyChallenge(), [])
  const dailyDone = history.some(
    (r) => r.seed === daily.seed && r.game === daily.game && r.weaponId === daily.weaponId && utcDayKey(new Date(r.date)) === daily.day,
  )

  const playDaily = useCallback(() => {
    const c = dailyChallenge()
    setWarmup(null)
    setSession((s) => ({
      weaponId: c.weaponId,
      mode: c.mode,
      guide: c.guide,
      game: c.game,
      customBullets: s.customBullets,
      seed: c.seed,
      daily: c.day,
    }))
    setRetryToken((t) => t + 1)
    setLastResult(null)
  }, [])

  const shareDaily = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}?d=${daily.day}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // fallback
      window.prompt('Copiá el link del desafío', url)
    }
  }, [daily.day])

  const startWarmup = useCallback(() => {
    const steps: SessionState[] = [
      { weaponId: 'ak47', mode: 'first4' as RecoilMode, guide: 'guided', game: 'recoil', customBullets: 15 },
      { weaponId: 'm4a4', mode: 'first9' as RecoilMode, guide: 'fade', game: 'recoil', customBullets: 15 },
      { weaponId: 'ak47', mode: 't2', guide: 'guided', game: 'transfer', customBullets: 15 },
    ]
    setWarmup({ steps, i: 0 })
    setSession(steps[0])
    setRetryToken((t) => t + 1)
    setLastResult(null)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (settingsOpen) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'a' || k === 'd') return // las maneja PlayArea
      if (k >= '1' && k <= '9') {
        const w = WEAPONS[Number(k) - 1]
        if (w) setWeapon(w)
        return
      }
      switch (k) {
        case 'q':
        case 'w':
        case 'e': {
          const modes = modesForGame(game).filter((m) => m.id !== 'custom')
          const idx = k === 'q' ? 0 : k === 'w' ? 1 : 2
          if (modes[idx]) setMode(modes[idx].id)
          break
        }
        case 'c':
          if (game === 'recoil') setMode('custom')
          break
        case '-':
        case '[':
          if (game === 'recoil' || (game === 'strafe' && mode === 'burst')) {
            if (document.pointerLockElement) document.exitPointerLock()
            setCustomBullets(customBullets - 1)
          }
          break
        case '+':
        case '=':
        case ']':
          if (game === 'recoil' || (game === 'strafe' && mode === 'burst')) {
            if (document.pointerLockElement) document.exitPointerLock()
            setCustomBullets(customBullets + 1)
          }
          break
        case 'tab':
          e.preventDefault()
          patchSession((s) => {
            const i = GAMES.findIndex((g) => g.id === s.game)
            const next = GAMES[(i + 1) % GAMES.length].id
            return { ...s, game: next, mode: defaultMode(next), seed: undefined, daily: undefined }
          })
          break
        case 'g':
          patchSession((s) => {
            const i = GUIDES.findIndex((g) => g.id === s.guide)
            return { ...s, guide: GUIDES[(i + 1) % GUIDES.length].id, seed: undefined, daily: undefined }
          })
          break
        case 'r':
          setRetryToken((t) => t + 1)
          setLastResult(null)
          break
        case 'm':
          updateSettings({ audio: !settings.audio })
          break
        case ' ':
          e.preventDefault()
          audioEngine.preview(weapon.cycleMs, bulletsForMode(weapon, mode, customBullets))
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    settingsOpen,
    settings.audio,
    updateSettings,
    weapon,
    mode,
    game,
    customBullets,
    setWeapon,
    setMode,
    setCustomBullets,
    patchSession,
  ]) // mode needed for strafe burst +/-

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-[#07080d] text-zinc-100">
        <header className="sticky top-0 z-20 border-b border-white/5 bg-[#07080d]/80 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-fuchsia-500/20 ring-1 ring-fuchsia-400/40">
              <Crosshair className="size-5 text-fuchsia-300" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold tracking-tight">Recoil Rhythm</h1>
              <p className="truncate text-xs text-white/50">
                Spray · Transfer · Strafe A/D · cadencia real de CS2
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={settings.audio ? 'Silenciar' : 'Activar sonido'}
                onClick={() => updateSettings({ audio: !settings.audio })}
              >
                {settings.audio ? <Volume2 /> : <VolumeX />}
              </Button>
              <SettingsDialog
                settings={settings}
                onChange={updateSettings}
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
              />
            </div>
          </div>
        </header>

        <main className="mx-auto grid max-w-[1680px] gap-4 px-3 py-3 sm:px-4 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1.15fr)_300px]">
          <section className="flex min-w-0 flex-col gap-3">
            {warmup && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                Calentamiento {warmup.i + 1}/{warmup.steps.length}: terminá la ráfaga para pasar al siguiente ejercicio.
              </div>
            )}
            {session.daily && (
              <div className="rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-xs text-fuchsia-100">
                Desafío del día {session.daily} · mismo seed para todos · Tab cambia de minijuego
              </div>
            )}
            <PlayArea
              weapon={weapon}
              mode={mode}
              guide={guide}
              game={game}
              settings={settings}
              retryToken={retryToken}
              customBullets={customBullets}
              seed={session.seed}
              ghost={settings.ghost ? best : null}
              onFinished={onFinished}
              onChangeSettings={updateSettings}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <ResultsPanel
                result={lastResult}
                weapon={weapon}
                best={best}
                sensitivity={settings.sensitivity}
                dpi={settings.dpi}
              />
              <WeaponInfo weapon={weapon} mode={mode} settings={settings} customBullets={customBullets} />
            </div>
          </section>

          <aside className="flex flex-col gap-4">
            <MetaPanel
              history={history}
              onPlayDaily={playDaily}
              onWarmup={startWarmup}
              onShare={shareDaily}
              dailyDone={dailyDone}
            />
            <Controls
              weapon={weapon}
              mode={mode}
              guide={guide}
              game={game}
              customBullets={customBullets}
              onWeapon={setWeapon}
              onMode={setMode}
              onGuide={setGuide}
              onGame={setGame}
              onCustomBullets={setCustomBullets}
            />
            <StatsPanel
              history={history}
              weaponId={weapon.id}
              mode={mode}
              guide={guide}
              game={game}
              onClear={clear}
            />
          </aside>
        </main>

        <footer className="mx-auto max-w-[1600px] px-4 pb-6 text-[11px] text-white/35">
          Cadencia real de CS2 (no se modifica). Disparar por encima del 34 % de velocidad máxima agrega dispersión.
          Click derecho libera el mouse. Tab: minijuego · Q/W/E: presets · C: custom · +/−: balas · G: guía · R: reiniciar ·
          A/D: strafe.
        </footer>
      </div>
    </TooltipProvider>
  )
}
