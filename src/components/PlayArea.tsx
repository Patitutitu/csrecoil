import { useCallback, useEffect, useRef, useState } from 'react'
import { Keyboard, MousePointerClick, TriangleAlert } from 'lucide-react'
import { audioEngine } from '@/engine/audio'
import { drawFrame, drawStrafeFrame, type Judgment, type Pulse } from '@/engine/render'
import { Movement } from '@/engine/movement'
import { SprayEngine, type EngineEvent } from '@/engine/sprayEngine'
import { StrafeEngine, type StrafeEvent } from '@/engine/strafeEngine'
import type {
  DrillMode,
  GameId,
  GuideLevel,
  RunResult,
  Settings,
  StrafeMode,
  WeaponDef,
} from '@/engine/types'
import { bpmForCycle, bulletsForMode } from '@/lib/units'
import { randomSeed } from '@/lib/random'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export interface PlayAreaProps {
  weapon: WeaponDef
  mode: DrillMode
  guide: GuideLevel
  game: GameId
  settings: Settings
  retryToken: number
  customBullets?: number
  seed?: number
  ghost?: RunResult | null
  onFinished: (result: RunResult) => void
}

type LockState = 'unlocked' | 'locked' | 'fallback'
type UiStatus = 'idle' | 'running' | 'finished'

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

export function PlayArea({
  weapon,
  mode,
  guide,
  game,
  settings,
  retryToken,
  customBullets = 15,
  seed: seedProp,
  ghost,
  onFinished,
}: PlayAreaProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sprayRef = useRef<SprayEngine | null>(null)
  const strafeRef = useRef<StrafeEngine | null>(null)
  const movementRef = useRef<Movement | null>(null)
  const pulsesRef = useRef<Pulse[]>([])
  const judgmentsRef = useRef<Judgment[]>([])
  const lockRef = useRef<LockState>('unlocked')
  const onFinishedRef = useRef(onFinished)
  const seedRef = useRef(seedProp ?? randomSeed())
  const ghostRef = useRef(ghost)
  const optsRef = useRef({
    weapon,
    mode,
    guide,
    game,
    sensitivity: settings.sensitivity,
    dpi: settings.dpi,
    customBullets,
  })

  const [lockState, setLockState] = useState<LockState>('unlocked')
  const [uiStatus, setUiStatus] = useState<UiStatus>('idle')
  const [lastResult, setLastResult] = useState<RunResult | null>(null)
  const [, setKeys] = useState({ a: false, d: false })
  const [isTouch] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches
      : false,
  )

  useEffect(() => {
    onFinishedRef.current = onFinished
    ghostRef.current = ghost
    optsRef.current = {
      weapon,
      mode,
      guide,
      game,
      sensitivity: settings.sensitivity,
      dpi: settings.dpi,
      customBullets,
    }
    if (seedProp !== undefined) seedRef.current = seedProp
  })

  const resetEngine = useCallback(() => {
    audioEngine.cancelScheduled()
    const o = optsRef.current
    const seed = seedProp !== undefined ? seedProp : randomSeed()
    seedRef.current = seed
    const movement = new Movement(o.weapon.maxSpeed)
    movementRef.current = movement
    setKeys({ a: false, d: false })
    if (o.game === 'strafe') {
      sprayRef.current = null
      strafeRef.current = new StrafeEngine({
        weapon: o.weapon,
        mode: o.mode as StrafeMode,
        guide: o.guide,
        sensitivity: o.sensitivity,
        dpi: o.dpi,
        seed,
        movement,
      })
    } else {
      strafeRef.current = null
      sprayRef.current = new SprayEngine({
        weapon: o.weapon,
        mode: o.mode,
        guide: o.guide,
        sensitivity: o.sensitivity,
        dpi: o.dpi,
        game: o.game,
        seed,
        movement,
        customBullets: o.customBullets,
      })
    }
    pulsesRef.current = []
    judgmentsRef.current = []
    setUiStatus('idle')
    setLastResult(null)
  }, [seedProp])

  useEffect(() => {
    resetEngine()
  }, [weapon, mode, guide, game, settings.sensitivity, settings.dpi, customBullets, retryToken, seedProp, resetEngine])

  useEffect(() => {
    audioEngine.enabled = settings.audio
    audioEngine.beat = settings.beat
    audioEngine.setVolume(settings.volume)
  }, [settings.audio, settings.beat, settings.volume])

  const setLock = useCallback((s: LockState) => {
    lockRef.current = s
    setLockState(s)
  }, [])

  const handleSprayEvents = useCallback((events: EngineEvent[], now: number) => {
    for (const ev of events) {
      if (ev.type === 'start') {
        setUiStatus('running')
      } else if (ev.type === 'shot') {
        pulsesRef.current.push({ pos: ev.shot.target, t: now, grade: ev.shot.grade })
        judgmentsRef.current.push({
          grade: ev.shot.grade,
          t: now,
          combo: ev.combo,
          label: ev.shot.moving ? 'EN MOVIMIENTO' : undefined,
        })
        audioEngine.playJudgment(ev.shot.grade)
        if (ev.kill !== null) {
          judgmentsRef.current.push({ grade: 'perfect', t: now + 1, combo: ev.combo, label: `KILL ${ev.kill + 1}` })
          audioEngine.playFinish(true)
        }
      } else if (ev.type === 'finished') {
        audioEngine.cancelScheduled()
        audioEngine.playFinish(ev.result.accuracy >= 0.7)
        setUiStatus('finished')
        setLastResult(ev.result)
        onFinishedRef.current(ev.result)
      }
    }
  }, [])

  const handleStrafeEvents = useCallback((events: StrafeEvent[], now: number) => {
    for (const ev of events) {
      if (ev.type === 'start') {
        setUiStatus('running')
      } else if (ev.type === 'shot') {
        if (ev.shot.target) pulsesRef.current.push({ pos: ev.shot.target, t: now, grade: ev.shot.grade })
        judgmentsRef.current.push({
          grade: ev.shot.grade,
          t: now,
          combo: ev.combo,
          label: ev.shot.moving ? 'EN MOVIMIENTO' : undefined,
        })
        audioEngine.playJudgment(ev.shot.grade)
      } else if (ev.type === 'pop') {
        judgmentsRef.current.push({ grade: ev.grade, t: now, combo: strafeRef.current?.combo ?? 0, label: ev.label })
        audioEngine.playJudgment(ev.grade)
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
      if (game === 'strafe') {
        let engine = strafeRef.current
        if (!engine) return
        if (engine.status === 'finished') {
          resetEngine()
          engine = strafeRef.current as StrafeEngine
        }
        audioEngine.ensure()
        if (engine.status === 'idle') {
          // La canción arranca con el primer click: agenda ticks al tempo del arma
          audioEngine.scheduleBurst(t, engine.cycleMs, Math.ceil(engine.chart.durationMs / engine.cycleMs))
        }
        handleStrafeEvents(engine.press(t), t)
        return
      }
      let engine = sprayRef.current
      if (!engine) return
      if (engine.status === 'finished') {
        resetEngine()
        engine = sprayRef.current as SprayEngine
      }
      if (engine.status !== 'idle') return
      audioEngine.ensure()
      audioEngine.scheduleBurst(t, engine.cycleMs, engine.bullets)
      handleSprayEvents(engine.press(t), t)
    },
    [game, handleSprayEvents, handleStrafeEvents, resetEngine],
  )

  const endRun = useCallback(
    (t: number) => {
      if (game === 'strafe') {
        const engine = strafeRef.current
        if (!engine) return
        handleStrafeEvents(engine.release(t), t)
        return
      }
      const engine = sprayRef.current
      if (!engine) return
      handleSprayEvents(engine.release(t), t)
    },
    [game, handleSprayEvents, handleStrafeEvents],
  )

  const unlockMouse = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock()
  }, [])

  // Entrada: pointer lock + movimiento crudo + click derecho libera
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
      if (e.button === 2) {
        e.preventDefault()
        unlockMouse()
        return
      }
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
      if (game === 'strafe') {
        strafeRef.current?.move(e.timeStamp, e.movementX, e.movementY)
        return
      }
      const engine = sprayRef.current
      if (!engine || engine.status !== 'running') return
      engine.move(e.timeStamp, e.movementX, e.movementY)
    }

    const onLockChange = () => {
      const locked = document.pointerLockElement === canvas
      if (locked) setLock('locked')
      else {
        if (lockRef.current === 'locked') setLock('unlocked')
        const t = performance.now()
        if (game === 'strafe') {
          const eng = strafeRef.current
          if (eng?.status === 'running') handleStrafeEvents(eng.abort(t), t)
        } else {
          endRun(t)
        }
        movementRef.current?.releaseAll(t)
        setKeys({ a: false, d: false })
      }
    }
    const onLockError = () => setLock('fallback')
    const onVisibility = () => {
      const t = performance.now()
      if (game === 'strafe') {
        const eng = strafeRef.current
        if (eng?.status === 'running') handleStrafeEvents(eng.abort(t), t)
      } else endRun(t)
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
  }, [startRun, endRun, setLock, unlockMouse, game, handleStrafeEvents])

  // Teclas A/D
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const k = e.key.toLowerCase()
      if (k !== 'a' && k !== 'd') return
      e.preventDefault()
      const m = movementRef.current
      if (!m) return
      m.setKey(performance.now(), k, true)
      setKeys({ a: m.keys.a, d: m.keys.d })
    }
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k !== 'a' && k !== 'd') return
      const m = movementRef.current
      if (!m) return
      m.setKey(performance.now(), k, false)
      setKeys({ a: m.keys.a, d: m.keys.d })
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

  // Loop de render
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
      movementRef.current?.advance(now)
      const speedFrac = movementRef.current?.speedFracAt(now) ?? 0
      const keyState = movementRef.current?.keys ?? { a: false, d: false }
      pulsesRef.current = pulsesRef.current.filter((p) => now - p.t < 500)
      if (judgmentsRef.current.length > 8) judgmentsRef.current.splice(0, judgmentsRef.current.length - 8)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      if (game === 'strafe') {
        const engine = strafeRef.current
        if (engine) {
          handleStrafeEvents(engine.update(now), now)
          drawStrafeFrame({
            ctx,
            width,
            height,
            now,
            engine,
            pulses: pulsesRef.current,
            judgments: judgmentsRef.current,
            speedFrac,
            keys: keyState,
          })
        }
      } else {
        const engine = sprayRef.current
        if (engine) {
          handleSprayEvents(engine.update(now), now)
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
            ghost: settings.ghost ? ghostRef.current : null,
            speedFrac,
            keys: keyState,
          })
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [game, handleSprayEvents, handleStrafeEvents, settings.ghost])

  const bullets = bulletsForMode(weapon, mode, customBullets)
  const gameLabel = game === 'recoil' ? 'Spray' : game === 'transfer' ? 'Transfer' : 'Strafe'

  return (
    <div
      ref={wrapperRef}
      className={cn(
        'relative w-full overflow-hidden rounded-xl border border-white/10 bg-[#0a0b12] shadow-2xl shadow-black/40',
        // Más alto que ancho para leer bien el pull-down y los impactos.
        'min-h-[560px] aspect-[3/4] sm:min-h-[680px] sm:aspect-[5/4] lg:min-h-[760px] lg:aspect-[4/3]',
        lockState === 'locked' ? 'cursor-none' : 'cursor-crosshair',
      )}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none select-none" />

      <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="bg-white/10 text-white backdrop-blur">
          {weapon.name}
        </Badge>
        <Badge variant="outline" className="border-fuchsia-400/40 text-fuchsia-200">
          {gameLabel}
        </Badge>
        <Badge variant="outline" className="border-white/20 text-white/80">
          {bullets} balas · {weapon.cycleMs} ms
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
            {game === 'strafe'
              ? 'Después: AAAA → DDDD (counter) → FIRE quieto. Sin la tecla opuesta el disparo no cuenta.'
              : `Mantené click izquierdo: la primera bala sale al instante y el resto a ${weapon.cycleMs} ms. Seguí el láser.`}
          </p>
          <p className="text-xs text-white/50">Click derecho o Esc liberan el mouse</p>
        </Overlay>
      )}

      {!isTouch && lockState === 'fallback' && uiStatus === 'idle' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
          <div className="flex items-center gap-2 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs text-amber-200 ring-1 ring-amber-400/30 backdrop-blur">
            <TriangleAlert className="size-3.5" />
            El navegador no permitió capturar el puntero: se usa movimiento relativo sin captura.
          </div>
        </div>
      )}

      {!isTouch && lockState === 'locked' && uiStatus === 'idle' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
          <div className="flex items-center gap-2 rounded-lg bg-black/50 px-3 py-1.5 text-xs text-white/80 ring-1 ring-white/10 backdrop-blur">
            <Keyboard className="size-3.5" />
            {game === 'strafe'
              ? 'AAAA→DDDD counter · FIRE quieto · sin counter = inválido · click derecho libera'
              : 'Click izquierdo dispara · A/D para strafear · click derecho libera · R reinicia'}
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
                {lastResult.transfer && ` · ${lastResult.transfer.kills}/${lastResult.transfer.targets} kills`}
                {lastResult.strafe && ` · ${lastResult.strafe.cleanWindows}/${lastResult.strafe.windows} limpios`}
                {!lastResult.completed && ` · cortaste en la bala ${lastResult.shots.length}`}
              </div>
              <div className="mt-0.5 text-[11px] text-white/50">Click o R para repetir · click derecho libera</div>
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
