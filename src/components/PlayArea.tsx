import { useCallback, useEffect, useRef, useState } from 'react'
import { Keyboard, MousePointerClick, TriangleAlert } from 'lucide-react'
import { audioEngine } from '@/engine/audio'
import { drawFrame, type Judgment, type Pulse } from '@/engine/render'
import { SprayEngine, type EngineEvent } from '@/engine/sprayEngine'
import type { DrillMode, GuideLevel, RunResult, Settings, WeaponDef } from '@/engine/types'
import { bpmForCycle, bulletsForMode } from '@/lib/units'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export interface PlayAreaProps {
  weapon: WeaponDef
  mode: DrillMode
  guide: GuideLevel
  settings: Settings
  retryToken: number
  onFinished: (result: RunResult) => void
}

type LockState = 'unlocked' | 'locked' | 'fallback'
type UiStatus = 'idle' | 'running' | 'finished'

const MODE_LABEL: Record<DrillMode, string> = {
  first4: '4 balas',
  first9: '9 balas',
  full: 'Cargador',
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

function guideAlphaFor(engine: SprayEngine, now: number): number {
  if (engine.guide === 'guided') return 1
  if (engine.guide === 'blind') return 0
  if (engine.status === 'idle') return 1
  if (engine.status === 'finished') return 0
  const n = engine.bullets
  const fadeStart = Math.max(1, Math.ceil(n * 0.25))
  const fadeEnd = Math.max(fadeStart + 1, Math.ceil(n * 0.5))
  const progress = (now - engine.t0) / engine.cycleMs
  return clamp01(1 - (progress - fadeStart) / (fadeEnd - fadeStart))
}

export function PlayArea({ weapon, mode, guide, settings, retryToken, onFinished }: PlayAreaProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<SprayEngine | null>(null)
  const pulsesRef = useRef<Pulse[]>([])
  const judgmentsRef = useRef<Judgment[]>([])
  const lockRef = useRef<LockState>('unlocked')
  const onFinishedRef = useRef(onFinished)
  const optsRef = useRef({ weapon, mode, guide, sensitivity: settings.sensitivity, dpi: settings.dpi })

  const [lockState, setLockState] = useState<LockState>('unlocked')
  const [uiStatus, setUiStatus] = useState<UiStatus>('idle')
  const [lastResult, setLastResult] = useState<RunResult | null>(null)
  const [isTouch] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches
      : false,
  )

  // Se ejecuta antes que el resto de los efectos en cada render: mantiene las refs al día.
  useEffect(() => {
    onFinishedRef.current = onFinished
    optsRef.current = { weapon, mode, guide, sensitivity: settings.sensitivity, dpi: settings.dpi }
  })

  const resetEngine = useCallback(() => {
    audioEngine.cancelScheduled()
    engineRef.current = new SprayEngine(optsRef.current)
    pulsesRef.current = []
    judgmentsRef.current = []
    setUiStatus('idle')
    setLastResult(null)
  }, [])

  useEffect(() => {
    resetEngine()
  }, [weapon, mode, guide, settings.sensitivity, settings.dpi, retryToken, resetEngine])

  useEffect(() => {
    audioEngine.enabled = settings.audio
    audioEngine.beat = settings.beat
    audioEngine.setVolume(settings.volume)
  }, [settings.audio, settings.beat, settings.volume])

  const setLock = useCallback((s: LockState) => {
    lockRef.current = s
    setLockState(s)
  }, [])

  const handleEvents = useCallback((events: EngineEvent[], now: number) => {
    const engine = engineRef.current
    if (!engine) return
    for (const ev of events) {
      if (ev.type === 'start') {
        setUiStatus('running')
      } else if (ev.type === 'shot') {
        pulsesRef.current.push({ pos: ev.shot.target, t: now, grade: ev.shot.grade })
        judgmentsRef.current.push({ grade: ev.shot.grade, t: now, combo: ev.combo })
        audioEngine.playJudgment(ev.shot.grade)
      } else if (ev.type === 'finished') {
        audioEngine.cancelScheduled()
        audioEngine.playFinish(ev.result.accuracy >= 0.7)
        setUiStatus('finished')
        setLastResult(ev.result)
        onFinishedRef.current(ev.result)
      }
    }
  }, [])

  const startRun = useCallback(
    (t: number) => {
      let engine = engineRef.current
      if (!engine) return
      if (engine.status === 'finished') {
        resetEngine()
        engine = engineRef.current as SprayEngine
      }
      if (engine.status !== 'idle') return
      audioEngine.ensure()
      audioEngine.scheduleBurst(t, engine.cycleMs, engine.bullets)
      handleEvents(engine.press(t), t)
    },
    [handleEvents, resetEngine],
  )

  const endRun = useCallback(
    (t: number) => {
      const engine = engineRef.current
      if (!engine) return
      handleEvents(engine.release(t), t)
    },
    [handleEvents],
  )

  // Entrada: pointer lock + movimiento crudo
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const requestLock = () => {
      type LockFn = (opts?: { unadjustedMovement?: boolean }) => Promise<void> | void
      const fn = canvas.requestPointerLock as unknown as LockFn
      try {
        const p = fn.call(canvas, { unadjustedMovement: true })
        if (p && typeof (p as Promise<void>).catch === 'function') {
          ;(p as Promise<void>).catch(() => {
            try {
              const q = fn.call(canvas)
              if (q && typeof (q as Promise<void>).catch === 'function') {
                ;(q as Promise<void>).catch(() => setLock('fallback'))
              }
            } catch {
              setLock('fallback')
            }
          })
        }
      } catch {
        try {
          fn.call(canvas)
        } catch {
          setLock('fallback')
        }
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      if (e.button !== 0) return
      e.preventDefault()
      audioEngine.ensure()
      if (lockRef.current === 'unlocked') {
        requestLock()
        return
      }
      startRun(e.timeStamp)
    }

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return
      endRun(e.timeStamp)
    }

    const onMove = (e: PointerEvent) => {
      const engine = engineRef.current
      if (!engine || engine.status !== 'running') return
      engine.move(e.timeStamp, e.movementX, e.movementY)
    }

    const onLockChange = () => {
      const locked = document.pointerLockElement === canvas
      if (locked) setLock('locked')
      else {
        if (lockRef.current === 'locked') setLock('unlocked')
        endRun(performance.now())
      }
    }
    const onLockError = () => setLock('fallback')
    const onVisibility = () => {
      if (document.hidden) endRun(performance.now())
    }
    const onContextMenu = (e: Event) => e.preventDefault()

    const useRaw = 'onpointerrawupdate' in window
    const moveEvent = useRaw ? 'pointerrawupdate' : 'pointermove'

    canvas.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener(moveEvent, onMove as EventListener)
    canvas.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('pointerlockchange', onLockChange)
    document.addEventListener('pointerlockerror', onLockError)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener(moveEvent, onMove as EventListener)
      canvas.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('pointerlockchange', onLockChange)
      document.removeEventListener('pointerlockerror', onLockError)
      document.removeEventListener('visibilitychange', onVisibility)
      if (document.pointerLockElement === canvas) document.exitPointerLock()
    }
  }, [startRun, endRun, setLock])

  // Tamaño del canvas y loop de render
  useEffect(() => {
    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0
    let dpr = 1
    const resize = () => {
      const rect = wrapper.getBoundingClientRect()
      width = Math.max(1, Math.floor(rect.width))
      height = Math.max(1, Math.floor(rect.height))
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrapper)

    let raf = 0
    const loop = () => {
      const now = performance.now()
      const engine = engineRef.current
      if (engine) {
        handleEvents(engine.update(now), now)
        pulsesRef.current = pulsesRef.current.filter((p) => now - p.t < 500)
        if (judgmentsRef.current.length > 6) judgmentsRef.current.splice(0, judgmentsRef.current.length - 6)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        drawFrame({
          ctx,
          width,
          height,
          now,
          engine,
          guideAlpha: guideAlphaFor(engine, now),
          pulses: pulsesRef.current,
          judgments: judgmentsRef.current,
          reveal: engine.status === 'finished',
        })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [handleEvents])

  const bullets = bulletsForMode(weapon, mode)

  return (
    <div
      ref={wrapperRef}
      className={cn(
        'relative w-full overflow-hidden rounded-xl border border-white/10 bg-[#0a0b12] shadow-2xl shadow-black/40',
        'aspect-[4/5] sm:aspect-[16/10]',
        lockState === 'locked' ? 'cursor-none' : 'cursor-crosshair',
      )}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none select-none" />

      <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="bg-white/10 text-white backdrop-blur">
          {weapon.name}
        </Badge>
        <Badge variant="outline" className="border-white/20 text-white/80">
          {MODE_LABEL[mode]} · {bullets}
        </Badge>
        <Badge variant="outline" className="border-white/20 text-white/80">
          {weapon.rpm} RPM · {weapon.cycleMs} ms
        </Badge>
        <Badge variant="outline" className="hidden border-white/20 text-white/60 sm:inline-flex">
          {bpmForCycle(weapon.cycleMs).toFixed(1)} BPM
        </Badge>
      </div>

      {isTouch && (
        <Overlay>
          <TriangleAlert className="size-8 text-amber-400" />
          <p className="text-lg font-semibold">Necesitás un mouse</p>
          <p className="max-w-xs text-sm text-white/70">
            El control de recoil se practica con movimiento crudo del mouse. Abrí esta página en una PC.
          </p>
        </Overlay>
      )}

      {!isTouch && lockState === 'unlocked' && (
        <Overlay>
          <MousePointerClick className="size-9 text-fuchsia-300" />
          <p className="text-lg font-semibold">Hacé click para capturar el mouse</p>
          <p className="max-w-sm text-sm text-white/70">
            Después mantené el click izquierdo: la primera bala sale al instante y el resto a {weapon.cycleMs} ms,
            la cadencia real de la {weapon.name}. Seguí el láser con la mira.
          </p>
          <p className="text-xs text-white/50">Esc libera el mouse en cualquier momento</p>
        </Overlay>
      )}

      {!isTouch && lockState === 'fallback' && uiStatus === 'idle' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
          <div className="flex items-center gap-2 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs text-amber-200 ring-1 ring-amber-400/30 backdrop-blur">
            <TriangleAlert className="size-3.5" />
            El navegador no permitió capturar el puntero: se usa movimiento relativo sin captura. Mantené click para
            disparar.
          </div>
        </div>
      )}

      {!isTouch && lockState === 'locked' && uiStatus === 'idle' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
          <div className="flex items-center gap-2 rounded-lg bg-black/50 px-3 py-1.5 text-xs text-white/80 ring-1 ring-white/10 backdrop-blur">
            <Keyboard className="size-3.5" />
            Mantené click izquierdo para disparar · soltá para cortar la ráfaga · R reinicia
          </div>
        </div>
      )}

      {uiStatus === 'finished' && lastResult && (
        <div className="pointer-events-none absolute inset-x-0 top-12 flex justify-center px-3 sm:top-auto sm:bottom-4">
          <div className="flex items-center gap-4 rounded-xl bg-black/60 px-4 py-3 ring-1 ring-white/10 backdrop-blur">
            <span
              className={cn(
                'text-4xl font-black tabular-nums',
                lastResult.grade === 'S'
                  ? 'text-cyan-300'
                  : lastResult.grade === 'A'
                    ? 'text-lime-300'
                    : lastResult.grade === 'B'
                      ? 'text-amber-300'
                      : 'text-rose-300',
              )}
            >
              {lastResult.grade}
            </span>
            <div className="text-left text-white">
              <div className="text-lg font-semibold tabular-nums">{lastResult.score.toLocaleString('es-AR')} pts</div>
              <div className="text-xs text-white/70">
                {Math.round(lastResult.accuracy * 100)}% precisión · combo x{lastResult.maxCombo}
                {!lastResult.completed && ` · cortaste en la bala ${lastResult.shots.length}`}
              </div>
              <div className="mt-0.5 text-[11px] text-white/50">Click o R para repetir</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 p-6 text-center text-white backdrop-blur-[2px]">
      {children}
    </div>
  )
}
