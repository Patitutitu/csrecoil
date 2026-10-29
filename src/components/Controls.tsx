import { Minus, Plus } from 'lucide-react'
import { WEAPONS } from '@/data/weapons'
import { GAMES, GUIDES, modesForGame } from '@/lib/drills'
import type { DrillMode, GameId, GuideLevel, WeaponDef } from '@/engine/types'
import { bulletsForMode } from '@/lib/units'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'

const CATEGORIES: { id: WeaponDef['category']; label: string }[] = [
  { id: 'rifle', label: 'Rifles' },
  { id: 'smg', label: 'Subfusiles' },
  { id: 'lmg', label: 'Ametralladora' },
]

interface ControlsProps {
  weapon: WeaponDef
  mode: DrillMode
  guide: GuideLevel
  game: GameId
  customBullets: number
  onWeapon: (w: WeaponDef) => void
  onMode: (m: DrillMode) => void
  onGuide: (g: GuideLevel) => void
  onGame: (g: GameId) => void
  onCustomBullets: (n: number) => void
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-auto rounded border border-white/15 bg-black/30 px-1 font-mono text-[10px] text-white/60">
      {children}
    </kbd>
  )
}

export function Controls({
  weapon,
  mode,
  guide,
  game,
  customBullets,
  onWeapon,
  onMode,
  onGuide,
  onGame,
  onCustomBullets,
}: ControlsProps) {
  const modes = modesForGame(game)
  const clampedCustom = Math.max(1, Math.min(weapon.magazine, customBullets))
  /** Spray: modo custom. Strafe burst: balas por cada FIRE. */
  const showBulletPicker = game === 'recoil' || (game === 'strafe' && mode === 'burst')

  const setCustom = (n: number) => {
    const v = Math.max(1, Math.min(weapon.magazine, Math.round(n)))
    onCustomBullets(v)
    if (game === 'recoil' && mode !== 'custom') onMode('custom')
    if (game === 'strafe' && mode !== 'burst') onMode('burst')
  }

  return (
    <>
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle>Minijuego</CardTitle>
          <CardDescription>Reglas reales de CS2, distintos objetivos de práctica</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-1.5 px-4">
          {GAMES.map((g) => (
            <button
              key={g.id}
              type="button"
              title={g.hint}
              onClick={() => onGame(g.id)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs transition-colors',
                g.id === game
                  ? 'border-fuchsia-400/60 bg-fuchsia-500/15 text-white'
                  : 'border-white/10 bg-white/[0.03] text-white/80 hover:bg-white/[0.07]',
              )}
            >
              <g.icon className="size-4" />
              {g.label}
            </button>
          ))}
          <p className="col-span-3 mt-1 text-[11px] text-white/50">{GAMES.find((g) => g.id === game)?.hint}</p>
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle>Arma</CardTitle>
          <CardDescription>Cadencia, patrón y velocidad reales de CS2</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-4">
          {CATEGORIES.map((c) => (
            <div key={c.id}>
              <div className="mb-1.5 text-[11px] font-medium tracking-wide text-white/40 uppercase">{c.label}</div>
              <div className="grid grid-cols-2 gap-1.5">
                {WEAPONS.filter((w) => w.category === c.id).map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => onWeapon(w)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors',
                      w.id === weapon.id
                        ? 'border-fuchsia-400/60 bg-fuchsia-500/15 text-white'
                        : 'border-white/10 bg-white/[0.03] text-white/80 hover:bg-white/[0.07]',
                    )}
                  >
                    <span
                      className={cn(
                        'rounded px-1 text-[10px] font-bold',
                        w.team === 'T' ? 'bg-amber-500/20 text-amber-300' : 'bg-sky-500/20 text-sky-300',
                      )}
                    >
                      {w.team}
                    </span>
                    <span className="flex flex-col leading-tight">
                      <span className="font-medium">{w.name}</span>
                      <span className="text-[11px] text-white/50">
                        {w.rpm} RPM · {w.maxSpeed} u/s
                      </span>
                    </span>
                    {WEAPONS.indexOf(w) < 9 && <Key>{WEAPONS.indexOf(w) + 1}</Key>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle>Ejercicio</CardTitle>
          <CardDescription>
            {game === 'strafe'
              ? 'Ventanas de disparo quieto — en Burst elegís cuántas balas por FIRE'
              : game === 'transfer'
                ? 'Objetivos en línea'
                : 'Cuántas balas controlás — presets o a medida'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5 px-4">
          {modes
            .filter((m) => m.id !== 'custom')
            .map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onMode(m.id)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors',
                  m.id === mode
                    ? 'border-fuchsia-400/60 bg-fuchsia-500/15 text-white'
                    : 'border-white/10 bg-white/[0.03] text-white/80 hover:bg-white/[0.07]',
                )}
              >
                <span className="flex flex-col leading-tight">
                  <span className="font-medium">
                    {m.label}
                    {game === 'strafe' && m.id === 'burst' ? (
                      <span className="ml-1.5 text-xs text-white/50">({clampedCustom}/FIRE)</span>
                    ) : game === 'strafe' && m.id === 'tap' ? (
                      <span className="ml-1.5 text-xs text-white/50">(1)</span>
                    ) : game !== 'strafe' ? (
                      <span className="ml-1.5 text-xs text-white/50">
                        ({bulletsForMode(weapon, m.id, clampedCustom)})
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[11px] text-white/50">{m.hint}</span>
                </span>
                <Key>{m.key}</Key>
              </button>
            ))}

          {showBulletPicker && (
            <div
              className={cn(
                'mt-1 rounded-lg border px-2.5 py-2.5 transition-colors',
                game === 'recoil'
                  ? mode === 'custom'
                    ? 'border-fuchsia-400/60 bg-fuchsia-500/15'
                    : 'border-white/10 bg-white/[0.03]'
                  : 'border-fuchsia-400/60 bg-fuchsia-500/15',
              )}
            >
              {game === 'recoil' ? (
                <button
                  type="button"
                  className="mb-2 flex w-full items-center gap-2 text-left text-sm"
                  onClick={() => onMode('custom')}
                >
                  <span className="flex flex-col leading-tight">
                    <span className="font-medium text-white">
                      Custom
                      <span className="ml-1.5 tabular-nums text-xs text-fuchsia-200">{clampedCustom} balas</span>
                    </span>
                    <span className="text-[11px] text-white/50">Elegí de 1 a {weapon.magazine} (cargador del arma)</span>
                  </span>
                  <Key>C</Key>
                </button>
              ) : (
                <div className="mb-2 text-sm">
                  <div className="font-medium text-white">
                    Balas por FIRE
                    <span className="ml-1.5 tabular-nums text-xs text-fuchsia-200">{clampedCustom}</span>
                  </div>
                  <div className="text-[11px] text-white/50">
                    Cada vez que toca disparar: de 1 a {weapon.magazine} (cargador)
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Menos balas"
                  className="flex size-7 items-center justify-center rounded-md border border-white/15 bg-black/30 text-white/80 hover:bg-white/10"
                  onClick={() => setCustom(clampedCustom - 1)}
                >
                  <Minus className="size-3.5" />
                </button>
                <Slider
                  min={1}
                  max={weapon.magazine}
                  step={1}
                  value={[clampedCustom]}
                  onValueChange={(v) => setCustom(Array.isArray(v) ? v[0] : v)}
                  className="flex-1"
                />
                <button
                  type="button"
                  aria-label="Más balas"
                  className="flex size-7 items-center justify-center rounded-md border border-white/15 bg-black/30 text-white/80 hover:bg-white/10"
                  onClick={() => setCustom(clampedCustom + 1)}
                >
                  <Plus className="size-3.5" />
                </button>
                <span className="w-8 text-right text-sm font-bold tabular-nums text-white">{clampedCustom}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {[4, 9, 15, weapon.magazine]
                  .filter((n, i, arr) => n >= 1 && n <= weapon.magazine && arr.indexOf(n) === i)
                  .map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={cn(
                        'rounded-md border px-2 py-0.5 text-[11px] tabular-nums transition-colors',
                        clampedCustom === n
                          ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-100'
                          : 'border-white/10 text-white/60 hover:bg-white/10 hover:text-white',
                      )}
                      onClick={() => setCustom(n)}
                    >
                      {n === weapon.magazine ? `Full (${n})` : n}
                    </button>
                  ))}
              </div>
              <p className="mt-1.5 text-[10px] text-white/40">
                Atajos: <kbd className="font-mono">−</kbd> / <kbd className="font-mono">+</kbd> o{' '}
                <kbd className="font-mono">[</kbd> / <kbd className="font-mono">]</kbd>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {game !== 'strafe' && (
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle>Guía</CardTitle>
            <CardDescription>De ver el patrón a memorizarlo</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-1.5 px-4">
            {GUIDES.map((g) => (
              <button
                key={g.id}
                type="button"
                title={g.hint}
                onClick={() => onGuide(g.id)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs transition-colors',
                  g.id === guide
                    ? 'border-fuchsia-400/60 bg-fuchsia-500/15 text-white'
                    : 'border-white/10 bg-white/[0.03] text-white/80 hover:bg-white/[0.07]',
                )}
              >
                <g.icon className="size-4" />
                {g.label}
              </button>
            ))}
            <p className="col-span-3 mt-1 text-[11px] text-white/50">
              {GUIDES.find((g) => g.id === guide)?.hint} · <kbd className="font-mono">G</kbd> alterna
            </p>
          </CardContent>
        </Card>
      )}
    </>
  )
}
