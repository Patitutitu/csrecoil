import { useEffect, useState } from 'react'
import { Settings2 } from 'lucide-react'
import type { Settings } from '@/engine/types'
import { cmPer360 } from '@/lib/units'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

interface SettingsDialogProps {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ settings, onChange, open, onOpenChange }: SettingsDialogProps) {
  const [sens, setSens] = useState(String(settings.sensitivity))
  const [dpi, setDpi] = useState(String(settings.dpi))

  useEffect(() => {
    if (open) {
      setSens(String(settings.sensitivity))
      setDpi(String(settings.dpi))
    }
  }, [open, settings.sensitivity, settings.dpi])

  const sensNum = Number.parseFloat(sens.replace(',', '.'))
  const dpiNum = Number.parseInt(dpi, 10)
  const sensValid = Number.isFinite(sensNum) && sensNum > 0 && sensNum <= 20
  const dpiValid = Number.isFinite(dpiNum) && dpiNum >= 100 && dpiNum <= 32000

  const apply = () => {
    if (!sensValid || !dpiValid) return
    onChange({ sensitivity: sensNum, dpi: dpiNum })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Settings2 data-icon="inline-start" />
            Ajustes
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustes</DialogTitle>
          <DialogDescription>
            Usá exactamente tu sensibilidad y DPI de CS2: así el movimiento que practicás es el mismo que hacés en el juego
            (0,022° por count × sens).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sens">Sensibilidad en CS2</Label>
            <Input
              id="sens"
              inputMode="decimal"
              value={sens}
              aria-invalid={!sensValid}
              onChange={(e) => setSens(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dpi">DPI del mouse</Label>
            <Input
              id="dpi"
              inputMode="numeric"
              value={dpi}
              aria-invalid={!dpiValid}
              onChange={(e) => setDpi(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
            />
          </div>
        </div>
        <p className="-mt-1 text-xs text-muted-foreground">
          {sensValid && dpiValid
            ? `eDPI ${Math.round(sensNum * dpiNum)} · ${cmPer360(sensNum, dpiNum).toFixed(1)} cm/360°`
            : 'Ingresá una sensibilidad entre 0,1 y 20 y un DPI entre 100 y 32000.'}
        </p>
        <p className="-mt-1 text-xs text-muted-foreground">
          Desactivá la aceleración del mouse del sistema. El juego pide movimiento sin ajustes al capturar el puntero,
          pero no todos los navegadores lo respetan.
        </p>

        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="audio">Sonido (metrónomo y calificaciones)</Label>
            <Switch id="audio" checked={settings.audio} onCheckedChange={(v) => onChange({ audio: v })} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="beat" className={settings.audio ? '' : 'opacity-50'}>
              Bombo cada 4 balas
            </Label>
            <Switch id="beat" disabled={!settings.audio} checked={settings.beat} onCheckedChange={(v) => onChange({ beat: v })} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Volumen</Label>
              <span className="text-xs tabular-nums text-muted-foreground">{Math.round(settings.volume * 100)}%</span>
            </div>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={[settings.volume]}
              disabled={!settings.audio}
              onValueChange={(v) => onChange({ volume: Array.isArray(v) ? v[0] : v })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={apply} disabled={!sensValid || !dpiValid}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
