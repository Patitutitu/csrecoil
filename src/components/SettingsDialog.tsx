import { useState } from 'react'
import { Settings2 } from 'lucide-react'
import type { Settings } from '@/engine/types'
import { cmPer360, cs2HorizontalFovDeg, pixelsPerDegree } from '@/lib/units'
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

/** Resoluciones típicas de CS2 (nativas y 4:3/5:4 de stretched). */
const RES_PRESETS: { label: string; w: number; h: number }[] = [
  { label: '1920×1080', w: 1920, h: 1080 },
  { label: '1600×900', w: 1600, h: 900 },
  { label: '1280×960', w: 1280, h: 960 },
  { label: '1440×1080', w: 1440, h: 1080 },
  { label: '1280×1024', w: 1280, h: 1024 },
  { label: '1024×768', w: 1024, h: 768 },
  { label: '2560×1440', w: 2560, h: 1440 },
  { label: '1680×1050', w: 1680, h: 1050 },
]

interface SettingsDialogProps {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ settings, onChange, open, onOpenChange }: SettingsDialogProps) {
  const [sens, setSens] = useState(String(settings.sensitivity))
  const [dpi, setDpi] = useState(String(settings.dpi))
  const [resW, setResW] = useState(String(settings.resWidth))
  const [resH, setResH] = useState(String(settings.resHeight))
  const [fov, setFov] = useState(String(settings.fov))

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setSens(String(settings.sensitivity))
      setDpi(String(settings.dpi))
      setResW(String(settings.resWidth))
      setResH(String(settings.resHeight))
      setFov(String(settings.fov))
    }
    onOpenChange(next)
  }

  const sensNum = Number.parseFloat(sens.replace(',', '.'))
  const dpiNum = Number.parseInt(dpi, 10)
  const resWNum = Number.parseInt(resW, 10)
  const resHNum = Number.parseInt(resH, 10)
  const fovNum = Number.parseFloat(fov.replace(',', '.'))

  const sensValid = Number.isFinite(sensNum) && sensNum > 0 && sensNum <= 20
  const dpiValid = Number.isFinite(dpiNum) && dpiNum >= 100 && dpiNum <= 32000
  const resValid =
    Number.isFinite(resWNum) &&
    Number.isFinite(resHNum) &&
    resWNum >= 640 &&
    resWNum <= 7680 &&
    resHNum >= 480 &&
    resHNum <= 4320
  const fovValid = Number.isFinite(fovNum) && fovNum >= 60 && fovNum <= 120
  const formValid = sensValid && dpiValid && resValid && fovValid

  const hFov = resValid && fovValid ? cs2HorizontalFovDeg(resWNum / resHNum, fovNum) : 0
  const ppd = resValid && fovValid ? pixelsPerDegree(resWNum, resHNum, fovNum) : 0

  const apply = () => {
    if (!formValid) return
    onChange({
      sensitivity: sensNum,
      dpi: dpiNum,
      resWidth: resWNum,
      resHeight: resHNum,
      fov: fovNum,
    })
    onOpenChange(false)
  }

  const pickPreset = (w: number, h: number) => {
    setResW(String(w))
    setResH(String(h))
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Settings2 data-icon="inline-start" />
            Ajustes
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajustes del simulador</DialogTitle>
          <DialogDescription>
            Sens, DPI, resolución y FOV de CS2. La mira se mueve en grados reales (sens × 0,022°) y la
            escala en pantalla usa tu resolución: 1° se ve igual que en el juego.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sens">Sensibilidad</Label>
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
            : 'Sensibilidad 0,1–20 · DPI 100–32000.'}
        </p>

        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex items-baseline justify-between gap-2">
            <Label>Resolución de CS2</Label>
            {resValid && fovValid && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                FOV hor. {hFov.toFixed(1)}° · {ppd.toFixed(1)} px/°
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RES_PRESETS.map((p) => {
              const active = resWNum === p.w && resHNum === p.h
              return (
                <Button
                  key={p.label}
                  type="button"
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  className="h-7 px-2 text-xs"
                  onClick={() => pickPreset(p.w, p.h)}
                >
                  {p.label}
                </Button>
              )
            })}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="resw">Ancho</Label>
              <Input
                id="resw"
                inputMode="numeric"
                value={resW}
                aria-invalid={!resValid}
                onChange={(e) => setResW(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="resh">Alto</Label>
              <Input
                id="resh"
                inputMode="numeric"
                value={resH}
                aria-invalid={!resValid}
                onChange={(e) => setResH(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fov">FOV</Label>
              <Input
                id="fov"
                inputMode="decimal"
                value={fov}
                aria-invalid={!fovValid}
                onChange={(e) => setFov(e.target.value)}
              />
            </div>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Misma resolución que en CS2 (si jugás stretched, la del juego: 1280×960, etc.). FOV default
            90. El inicio del recoil (0,0) queda en el centro.
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <Label>Zoom del gráfico</Label>
            <span className="text-xs tabular-nums text-muted-foreground">{settings.viewZoom}×</span>
          </div>
          <Slider
            min={1}
            max={4}
            step={0.5}
            value={[settings.viewZoom]}
            onValueChange={(v) => onChange({ viewZoom: Array.isArray(v) ? v[0] : v })}
          />
          <p className="text-[11px] leading-snug text-muted-foreground">
            Dejá la resolución de CS2 (ej. 1600×900). El feel real lo dan sens+DPI+res a 1×; el zoom
            solo agranda el dibujo. AK completa ~2–2,5×; 4× sirve para ráfagas cortas (si no, se corta).
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          Desactivá la aceleración del mouse en Windows («Mejorar precisión del puntero»). Chrome/Edge
          con raw input se sienten más cerca del juego.
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
          <div className="flex items-center justify-between">
            <Label htmlFor="ghost">Fantasma del récord personal</Label>
            <Switch id="ghost" checked={settings.ghost} onCheckedChange={(v) => onChange({ ghost: v })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={apply} disabled={!formValid}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
