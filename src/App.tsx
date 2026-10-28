import { useCallback, useEffect, useState } from 'react'
import { Crosshair, Volume2, VolumeX } from 'lucide-react'
import { Controls, GUIDES, MODES } from '@/components/Controls'
import { PlayArea } from '@/components/PlayArea'
import { ResultsPanel } from '@/components/ResultsPanel'
import { SettingsDialog } from '@/components/SettingsDialog'
import { StatsPanel } from '@/components/StatsPanel'
import { WeaponInfo } from '@/components/WeaponInfo'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { WEAPONS } from '@/data/weapons'
import { audioEngine } from '@/engine/audio'
import type { DrillMode, GuideLevel, RunResult, WeaponDef } from '@/engine/types'
import { bulletsForMode } from '@/lib/units'
import { bestRun, useHistory, useSettings } from '@/store/storage'

const SESSION_KEY = 'cs2-recoil-rhythm:session'

interface SessionState {
  weaponId: string
  mode: DrillMode
  guide: GuideLevel
}

function readSession(): SessionState {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) {
      const s = JSON.parse(raw) as Partial<SessionState>
      return {
        weaponId: WEAPONS.some((w) => w.id === s.weaponId) ? (s.weaponId as string) : WEAPONS[0].id,
        mode: MODES.some((m) => m.id === s.mode) ? (s.mode as DrillMode) : 'first4',
        guide: GUIDES.some((g) => g.id === s.guide) ? (s.guide as GuideLevel) : 'guided',
      }
    }
  } catch {
    // sin sesión previa
  }
  return { weaponId: WEAPONS[0].id, mode: 'first4', guide: 'guided' }
}

export default function App() {
  const [settings, updateSettings] = useSettings()
  const { history, addRun, clear } = useHistory()
  const [session, setSession] = useState<SessionState>(readSession)
  const [retryToken, setRetryToken] = useState(0)
  const [lastResult, setLastResult] = useState<RunResult | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const weapon = WEAPONS.find((w) => w.id === session.weaponId) ?? WEAPONS[0]
  const { mode, guide } = session

  useEffect(() => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } catch {
      // ignorar
    }
    setLastResult(null)
  }, [session])

  const setWeapon = useCallback((w: WeaponDef) => setSession((s) => ({ ...s, weaponId: w.id })), [])
  const setMode = useCallback((m: DrillMode) => setSession((s) => ({ ...s, mode: m })), [])
  const setGuide = useCallback((g: GuideLevel) => setSession((s) => ({ ...s, guide: g })), [])

  const onFinished = useCallback(
    (r: RunResult) => {
      setLastResult(r)
      addRun(r)
    },
    [addRun],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (settingsOpen) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k >= '1' && k <= '9') {
        const w = WEAPONS[Number(k) - 1]
        if (w) setWeapon(w)
        return
      }
      switch (k) {
        case 'q':
          setMode('first4')
          break
        case 'w':
          setMode('first9')
          break
        case 'e':
          setMode('full')
          break
        case 'g':
          setSession((s) => {
            const i = GUIDES.findIndex((g) => g.id === s.guide)
            return { ...s, guide: GUIDES[(i + 1) % GUIDES.length].id }
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
          audioEngine.preview(weapon.cycleMs, bulletsForMode(weapon, mode))
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen, settings.audio, updateSettings, weapon, mode, setWeapon, setMode])

  const best = bestRun(history, weapon.id, mode, guide)

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-[#07080d] text-zinc-100">
        <header className="sticky top-0 z-20 border-b border-white/5 bg-[#07080d]/80 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-fuchsia-500/20 ring-1 ring-fuchsia-400/40">
              <Crosshair className="size-5 text-fuchsia-300" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold tracking-tight">Recoil Rhythm</h1>
              <p className="truncate text-xs text-white/50">Control de spray de CS2 como juego de ritmo, a la cadencia real</p>
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
              <SettingsDialog settings={settings} onChange={updateSettings} open={settingsOpen} onOpenChange={setSettingsOpen} />
            </div>
          </div>
        </header>

        <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-w-0 flex-col gap-4">
            <PlayArea
              weapon={weapon}
              mode={mode}
              guide={guide}
              settings={settings}
              retryToken={retryToken}
              onFinished={onFinished}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <ResultsPanel result={lastResult} weapon={weapon} best={best} />
              <WeaponInfo weapon={weapon} mode={mode} settings={settings} />
            </div>
          </section>

          <aside className="flex flex-col gap-4">
            <Controls weapon={weapon} mode={mode} guide={guide} onWeapon={setWeapon} onMode={setMode} onGuide={setGuide} />
            <StatsPanel history={history} weaponId={weapon.id} mode={mode} guide={guide} onClear={clear} />
          </aside>
        </main>

        <footer className="mx-auto max-w-7xl px-4 pb-6 text-[11px] text-white/35">
          La cadencia de cada arma es la real de CS2 y no se puede modificar: el ritmo se adapta al arma, no al revés.
          Los patrones provienen de mediciones públicas en grados (ver README). Sin disparos ni objetivos: solo luz,
          sonido y tu mouse.
        </footer>
      </div>
    </TooltipProvider>
  )
}
