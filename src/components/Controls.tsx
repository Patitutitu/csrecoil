import { WEAPONS } from '@/data/weapons'
import { GAMES, GUIDES, modesForGame } from '@/lib/drills'
import type { DrillMode, GameId, GuideLevel, WeaponDef } from '@/engine/types'
import { bulletsForMode } from '@/lib/units'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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
  onWeapon: (w: WeaponDef) => void
  onMode: (m: DrillMode) => void
  onGuide: (g: GuideLevel) => void
  onGame: (g: GameId) => void
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-auto rounded border border-white/15 bg-black/30 px-1 font-mono text-[10px] text-white/60">
      {children}
    </kbd>
  )
}

export function Controls({ weapon, mode, guide, game, onWeapon, onMode, onGuide, onGame }: ControlsProps) {
  const modes = modesForGame(game)
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
            {game === 'strafe' ? 'Ventanas de disparo quieto' : game === 'transfer' ? 'Objetivos en línea' : 'Cuántas balas controlás'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5 px-4">
          {modes.map((m) => (
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
                  {game !== 'strafe' && (
                    <span className="ml-1.5 text-xs text-white/50">({bulletsForMode(weapon, m.id)})</span>
                  )}
                </span>
                <span className="text-[11px] text-white/50">{m.hint}</span>
              </span>
              <Key>{m.key}</Key>
            </button>
          ))}
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
