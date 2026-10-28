import { Eye, EyeOff, Sparkles } from 'lucide-react'
import { WEAPONS } from '@/data/weapons'
import type { DrillMode, GuideLevel, WeaponDef } from '@/engine/types'
import { bulletsForMode } from '@/lib/units'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const MODES: { id: DrillMode; label: string; key: string; hint: string }[] = [
  { id: 'first4', label: '4 balas', key: 'Q', hint: 'El tap controlado: casi todo es pull-down' },
  { id: 'first9', label: '9 balas', key: 'W', hint: 'La ráfaga que define la mayoría de los duelos' },
  { id: 'full', label: 'Cargador', key: 'E', hint: 'El patrón completo, con todos los quiebres laterales' },
]

export const GUIDES: { id: GuideLevel; label: string; hint: string; icon: typeof Eye }[] = [
  { id: 'guided', label: 'Guiado', hint: 'Camino y láser visibles toda la ráfaga', icon: Eye },
  { id: 'fade', label: 'Fade', hint: 'La guía se apaga tras las primeras balas', icon: Sparkles },
  { id: 'blind', label: 'Ciego', hint: 'Solo el metrónomo; el patrón se revela al final', icon: EyeOff },
]

interface ControlsProps {
  weapon: WeaponDef
  mode: DrillMode
  guide: GuideLevel
  onWeapon: (w: WeaponDef) => void
  onMode: (m: DrillMode) => void
  onGuide: (g: GuideLevel) => void
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-auto rounded border border-white/15 bg-black/30 px-1 font-mono text-[10px] text-white/60">
      {children}
    </kbd>
  )
}

export function Controls({ weapon, mode, guide, onWeapon, onMode, onGuide }: ControlsProps) {
  return (
    <>
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle>Arma</CardTitle>
          <CardDescription>Cadencia y patrón reales de CS2</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-1.5 px-4">
          {WEAPONS.map((w, i) => (
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
                  {w.rpm} RPM · {w.cycleMs} ms
                </span>
              </span>
              <Key>{i + 1}</Key>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle>Ejercicio</CardTitle>
          <CardDescription>Cuántas balas controlás en la ráfaga</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5 px-4">
          {MODES.map((m) => (
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
                  <span className="ml-1.5 text-xs text-white/50">({bulletsForMode(weapon, m.id)})</span>
                </span>
                <span className="text-[11px] text-white/50">{m.hint}</span>
              </span>
              <Key>{m.key}</Key>
            </button>
          ))}
        </CardContent>
      </Card>

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
    </>
  )
}
