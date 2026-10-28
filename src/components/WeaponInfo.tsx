import { Music2 } from 'lucide-react'
import { audioEngine } from '@/engine/audio'
import type { DrillMode, Settings, WeaponDef } from '@/engine/types'
import { bpmForCycle, bulletsForMode, compensationPath, degToCm, degToCounts } from '@/lib/units'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface WeaponInfoProps {
  weapon: WeaponDef
  mode: DrillMode
  settings: Settings
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
      <div className="text-[11px] text-white/50">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-white">{value}</div>
      {sub && <div className="text-[10px] text-white/40">{sub}</div>}
    </div>
  )
}

export function WeaponInfo({ weapon, mode, settings }: WeaponInfoProps) {
  const bullets = bulletsForMode(weapon, mode)
  const path = compensationPath(weapon, bullets)
  const last = path[path.length - 1]
  const pullDownDeg = Math.max(...path.map((p) => -p.y))
  const durationMs = (bullets - 1) * weapon.cycleMs
  const counts = degToCounts(pullDownDeg, settings.sensitivity)
  const cm = degToCm(pullDownDeg, settings.sensitivity, settings.dpi)

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle>Ficha de la ráfaga</CardTitle>
        <CardDescription>Con tu sens {settings.sensitivity} y {settings.dpi} DPI</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <div className="grid grid-cols-2 gap-1.5">
          <Stat label="Cadencia" value={`${weapon.rpm} RPM`} sub={`${weapon.cycleMs} ms entre balas`} />
          <Stat label="Tempo" value={`${bpmForCycle(weapon.cycleMs).toFixed(1)} BPM`} sub="cada bala = semicorchea" />
          <Stat label="Duración" value={`${(durationMs / 1000).toFixed(2)} s`} sub={`${bullets} balas`} />
          <Stat label="Pull-down máx." value={`${pullDownDeg.toFixed(2)}°`} sub={`${Math.round(counts)} counts · ${cm.toFixed(1)} cm`} />
          <Stat
            label="Deriva final"
            value={`${last.x >= 0 ? '→' : '←'} ${Math.abs(last.x).toFixed(2)}°`}
            sub="mouse en la última bala"
          />
          <Stat label="Cargador" value={`${weapon.magazine}`} sub="balas" />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={() => audioEngine.preview(weapon.cycleMs, bullets)}
        >
          <Music2 data-icon="inline-start" />
          Escuchar el ritmo
          <kbd className="ml-auto font-mono text-[10px] text-white/50">Espacio</kbd>
        </Button>
        <p className="mt-2 text-[10px] leading-snug text-white/40">Fuente del patrón: {weapon.source}.</p>
      </CardContent>
    </Card>
  )
}
