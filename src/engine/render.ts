import { HITBOX } from '@/lib/transfer'
import type { ChartNote, StrafeChart } from '@/lib/strafeChart'
import { displayPixelsPerDegree } from '@/lib/units'
import type { SprayEngine } from './sprayEngine'
import type { StrafeEngine } from './strafeEngine'
import type { HitGrade, RunResult, TracePoint, Vec2 } from './types'
import { ACCURATE_SPEED_FRACTION } from './movement'

export const GRADE_COLORS: Record<HitGrade, string> = {
  perfect: '#22d3ee',
  great: '#a3e635',
  good: '#fbbf24',
  miss: '#fb7185',
}

export const GRADE_LABELS: Record<HitGrade, string> = {
  perfect: 'PERFECTO',
  great: 'GENIAL',
  good: 'BIEN',
  miss: 'FALLO',
}

const LASER = '#e879f9'
const LASER_CORE = '#fdf4ff'
const PATH = '#a78bfa'
const CROSSHAIR = '#4ade80'

export interface Pulse {
  pos: Vec2
  t: number
  grade: HitGrade
}

export interface Judgment {
  grade: HitGrade
  t: number
  combo: number
  label?: string
}

export interface Frame {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  now: number
  engine: SprayEngine
  /** 0..1, visibilidad de la guía (camino + láser). */
  guideAlpha: number
  pulses: Pulse[]
  judgments: Judgment[]
  reveal: boolean
  ghost?: RunResult | null
  speedFrac?: number
  keys?: { a: boolean; d: boolean }
  /** Resolución/FOV de CS2 del jugador → escala visual real (px/°). */
  resWidth?: number
  resHeight?: number
  fov?: number
  /** Zoom de práctica (agranda el gráfico; mouse sigue en grados). */
  viewZoom?: number
}

export interface StrafeFrame {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  now: number
  engine: StrafeEngine
  pulses: Pulse[]
  judgments: Judgment[]
  speedFrac: number
  keys: { a: boolean; d: boolean }
}

export interface Viewport {
  anchor: Vec2
  ppd: number
}

export interface ViewportOpts {
  resWidth?: number
  resHeight?: number
  fov?: number
  viewZoom?: number
}

/**
 * Simulador CS2: el inicio del recoil (0,0) prefiere el centro.
 * Si el zoom no deja entrar el path (p. ej. AK ×4), se desplaza el ancla
 * (suele subir) para que el pull-down quepa — sin cambiar px/° ni el mouse.
 */
export function computeViewport(width: number, height: number, path: Vec2[], opts: ViewportOpts = {}): Viewport {
  const resW = opts.resWidth ?? 1920
  const resH = opts.resHeight ?? 1080
  const fov = opts.fov ?? 90
  const zoom = opts.viewZoom ?? 1
  const ppd = displayPixelsPerDegree(width, resW, resH, fov, zoom)
  let ax = width / 2
  let ay = height / 2
  if (path.length > 0 && ppd > 0) {
    const padX = 40
    const padY = 56
    let minX = 0
    let maxX = 0
    let minY = 0
    let maxY = 0
    for (const p of path) {
      const ox = p.x * ppd
      const oy = -p.y * ppd
      minX = Math.min(minX, ox)
      maxX = Math.max(maxX, ox)
      minY = Math.min(minY, oy)
      maxY = Math.max(maxY, oy)
    }
    if (ax + maxX > width - padX) ax = width - padX - maxX
    if (ax + minX < padX) ax = padX - minX
    if (ay + maxY > height - padY) ay = height - padY - maxY
    if (ay + minY < padY) ay = padY - minY
  }
  return { anchor: { x: ax, y: ay }, ppd }
}

export function toScreen(v: Viewport, p: Vec2): Vec2 {
  return { x: v.anchor.x + p.x * v.ppd, y: v.anchor.y - p.y * v.ppd }
}

export function drawFrame(f: Frame): void {
  const { ctx, width, height, engine, now } = f
  const view = computeViewport(width, height, engine.path, {
    resWidth: f.resWidth,
    resHeight: f.resHeight,
    fov: f.fov,
    viewZoom: f.viewZoom,
  })

  drawBackground(ctx, width, height, view)

  const running = engine.status === 'running'
  const finished = engine.status === 'finished'
  const showGuide = f.reveal || f.guideAlpha > 0.001

  if (engine.game === 'transfer') {
    drawTargets(ctx, view, engine)
  }

  if (showGuide) {
    drawPath(ctx, view, engine, f.reveal ? 1 : f.guideAlpha, now)
  }

  if (f.ghost && engine.game === 'recoil') {
    drawGhost(ctx, view, f.ghost.trace, engine.t0, now, engine.status)
  }

  drawJudgedNodes(ctx, view, engine)

  if (finished || f.reveal) {
    drawTrace(ctx, view, engine)
    drawErrorLinks(ctx, view, engine)
  }

  drawPulses(ctx, view, f.pulses, now)

  if (running && f.guideAlpha > 0.001) {
    drawLaser(ctx, view, engine, now, f.guideAlpha)
  }

  if (running) {
    drawRecentTrail(ctx, view, engine, now)
  }

  // Impactos al frente (estilo SHOW IMPACTS): se leen sobre el path/láser.
  if (engine.game === 'transfer' || engine.game === 'recoil') {
    drawImpacts(ctx, view, engine)
  }

  const playerPos = engine.status === 'idle' ? { x: 0, y: 0 } : engine.pos
  const accurate = (f.speedFrac ?? 0) <= ACCURATE_SPEED_FRACTION
  drawCrosshair(ctx, toScreen(view, playerPos), running, accurate)

  drawHud(ctx, width, height, engine, f.judgments, now)
  if (f.keys) drawKeyHud(ctx, width, height, f.keys, f.speedFrac ?? 0)
}

export function drawStrafeFrame(f: StrafeFrame): void {
  const { ctx, width, height, engine, now } = f
  drawBackgroundFlat(ctx, width, height)
  const rel = engine.status === 'idle' ? 0 : now - engine.t0
  drawStrafeHighway(ctx, width, height, engine.chart, rel, engine)
  drawSpeedBar(ctx, width, height, f.speedFrac)
  drawKeyHud(ctx, width, height, f.keys, f.speedFrac)
  drawStrafeHud(ctx, width, height, engine, f.judgments, now)

  // Mini spray del burst activo en la esquina
  if (engine.burst && engine.burst.status !== 'idle') {
    const mini: Frame = {
      ctx,
      width: Math.min(280, width * 0.35),
      height: Math.min(200, height * 0.35),
      now,
      engine: engine.burst,
      guideAlpha: 1,
      pulses: f.pulses,
      judgments: [],
      reveal: engine.burst.status === 'finished',
      speedFrac: f.speedFrac,
      resWidth: 1920,
      resHeight: 1080,
      fov: 90,
    }
    ctx.save()
    ctx.translate(width - mini.width - 12, height - mini.height - 48)
    ctx.beginPath()
    ctx.rect(0, 0, mini.width, mini.height)
    ctx.clip()
    drawFrame(mini)
    ctx.restore()
  }
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, view: Viewport): void {
  const g = ctx.createRadialGradient(w / 2, h * 0.35, 10, w / 2, h * 0.35, Math.max(w, h) * 0.8)
  g.addColorStop(0, '#171a2b')
  g.addColorStop(1, '#0a0b12')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  ctx.save()
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.07)'
  ctx.lineWidth = 1
  const step = view.ppd
  if (step > 6) {
    for (let x = view.anchor.x; x < w; x += step) line(ctx, x, 0, x, h)
    for (let x = view.anchor.x - step; x > 0; x -= step) line(ctx, x, 0, x, h)
    for (let y = view.anchor.y; y < h; y += step) line(ctx, 0, y, w, y)
    for (let y = view.anchor.y - step; y > 0; y -= step) line(ctx, 0, y, w, y)
  }
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)'
  line(ctx, view.anchor.x, 0, view.anchor.x, h)
  line(ctx, 0, view.anchor.y, w, view.anchor.y)
  ctx.restore()

  // Punto de mira en el muro (0,0): donde deberían acumularse los impactos si compensás bien.
  ctx.save()
  ctx.strokeStyle = 'rgba(250, 250, 250, 0.35)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(view.anchor.x, view.anchor.y, 10, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(103, 232, 249, 0.5)'
  ctx.beginPath()
  ctx.arc(view.anchor.x, view.anchor.y, 3, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.fillStyle = 'rgba(148, 163, 184, 0.55)'
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  const barLen = view.ppd
  const bx = 16
  const by = h - 16
  ctx.fillRect(bx, by - 1, barLen, 2)
  ctx.fillText('1°', bx + barLen + 6, by + 3)
  ctx.fillStyle = 'rgba(103, 232, 249, 0.75)'
  ctx.fillText('impactos', bx, by - 14)
  ctx.fillStyle = 'rgba(167, 139, 250, 0.75)'
  ctx.fillText('mira', bx + 64, by - 14)
  ctx.restore()
}

function drawBackgroundFlat(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#121526')
  g.addColorStop(1, '#08090f')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function drawTargets(ctx: CanvasRenderingContext2D, view: Viewport, engine: SprayEngine): void {
  ctx.save()
  engine.targets.forEach((t, i) => {
    const c = toScreen(view, t)
    const killed = engine.hits[i] >= 4
    const active = i === engine.currentTarget && engine.status === 'running'
    const chestW = HITBOX.chestHalfWidth * view.ppd
    const top = HITBOX.chestTop * view.ppd
    const bot = -HITBOX.chestBottom * view.ppd
    ctx.strokeStyle = killed ? 'rgba(34, 211, 238, 0.85)' : active ? '#f472b6' : 'rgba(244, 114, 182, 0.45)'
    ctx.fillStyle = killed ? 'rgba(34, 211, 238, 0.12)' : active ? 'rgba(244, 114, 182, 0.12)' : 'rgba(244, 114, 182, 0.05)'
    ctx.lineWidth = active ? 2.5 : 1.5
    roundRect(ctx, c.x - chestW, c.y - top, chestW * 2, top + bot, 4)
    ctx.fill()
    ctx.stroke()
    // cabeza
    const hr = HITBOX.headR * view.ppd
    ctx.beginPath()
    ctx.arc(c.x, c.y - HITBOX.headY * view.ppd, hr, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = killed ? '#22d3ee' : 'rgba(226,232,240,0.8)'
    ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(`${engine.hits[i]}/4`, c.x, c.y - top - hr - 6)
  })
  ctx.restore()
}

function drawPath(ctx: CanvasRenderingContext2D, view: Viewport, engine: SprayEngine, alpha: number, now: number): void {
  const pts = engine.path.map((p) => toScreen(view, p))
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  ctx.strokeStyle = 'rgba(167, 139, 250, 0.25)'
  ctx.lineWidth = 8
  polyline(ctx, pts)
  ctx.strokeStyle = PATH
  ctx.lineWidth = 2
  polyline(ctx, pts)

  const nextIndex = engine.status === 'running' ? engine.nextIndex : engine.status === 'idle' ? 0 : engine.bullets
  const upcoming = engine.status === 'running' ? nextIndex : -1
  for (let i = 0; i < pts.length; i++) {
    if (i < nextIndex) continue
    const p = pts[i]
    const isNext = i === upcoming
    const r = isNext ? 7 + 2 * Math.sin(now / 60) : 4.5
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fillStyle = isNext ? LASER : 'rgba(196, 181, 253, 0.9)'
    ctx.fill()
    if (view.ppd > 18 || i % 5 === 4 || i === 0 || i === pts.length - 1) {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.75)'
      ctx.font = '10px ui-sans-serif, system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1), p.x + 9, p.y)
    }
  }
  ctx.restore()
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  view: Viewport,
  trace: TracePoint[],
  t0: number,
  now: number,
  status: SprayEngine['status'],
): void {
  if (trace.length < 2) return
  ctx.save()
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  const limit = status === 'running' ? now - t0 : Infinity
  const p0 = toScreen(view, trace[0])
  ctx.moveTo(p0.x, p0.y)
  for (let i = 1; i < trace.length; i++) {
    if (trace[i].t > limit) break
    const p = toScreen(view, trace[i])
    ctx.lineTo(p.x, p.y)
  }
  ctx.stroke()
  ctx.restore()
}

function drawJudgedNodes(ctx: CanvasRenderingContext2D, view: Viewport, engine: SprayEngine): void {
  // Nodos del path (dónde debía estar la mira): más chicos y apagados que los impactos del muro.
  ctx.save()
  for (const s of engine.shots) {
    const p = toScreen(view, s.target)
    ctx.beginPath()
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(167, 139, 250, 0.55)'
    ctx.fill()
    ctx.lineWidth = 1.25
    ctx.strokeStyle = GRADE_COLORS[s.grade]
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Impactos en el muro (estilo Recoil Master “SHOW IMPACTS”): punto cian/ámbar
 * brillante, distinto del path violeta de la mira. Así se nota dónde pegó cada bala.
 */
function drawImpacts(ctx: CanvasRenderingContext2D, view: Viewport, engine: SprayEngine): void {
  ctx.save()
  for (const s of engine.shots) {
    const p = toScreen(view, s.impact)
    const miss = s.grade === 'miss'
    const core = miss ? '#fb7185' : '#67e8f9'
    const glow = miss ? 'rgba(251, 113, 133, 0.55)' : 'rgba(34, 211, 238, 0.55)'
    const r = miss ? 6 : 5.5

    // halo (como el glow de SHOW IMPACTS en CS2)
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2)
    g.addColorStop(0, glow)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2)
    ctx.fill()

    // “decal” oscuro detrás, como el agujero en la pared
    ctx.fillStyle = 'rgba(15, 18, 28, 0.92)'
    ctx.beginPath()
    ctx.arc(p.x, p.y, r + 1.5, 0, Math.PI * 2)
    ctx.fill()

    // núcleo brillante
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = miss ? '#ffe4e6' : '#ecfeff'
    ctx.beginPath()
    ctx.arc(p.x - r * 0.25, p.y - r * 0.25, r * 0.35, 0, Math.PI * 2)
    ctx.fill()

    // anillo de grade (solo borde fino) para no confundir con el path
    ctx.strokeStyle = GRADE_COLORS[s.grade]
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(p.x, p.y, r + 2.5, 0, Math.PI * 2)
    ctx.stroke()

    // número de bala, legible sobre el glow
    ctx.fillStyle = 'rgba(248, 250, 252, 0.92)'
    ctx.font = '700 9px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(s.index + 1), p.x + r + 4, p.y)
  }
  ctx.restore()
}

function drawErrorLinks(ctx: CanvasRenderingContext2D, view: Viewport, engine: SprayEngine): void {
  ctx.save()
  for (const s of engine.shots) {
    const a = toScreen(view, s.target)
    const b = toScreen(view, s.actual)
    ctx.strokeStyle = GRADE_COLORS[s.grade]
    ctx.globalAlpha = 0.6
    ctx.lineWidth = 1
    line(ctx, a.x, a.y, b.x, b.y)
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.moveTo(b.x - 4, b.y - 4)
    ctx.lineTo(b.x + 4, b.y + 4)
    ctx.moveTo(b.x + 4, b.y - 4)
    ctx.lineTo(b.x - 4, b.y + 4)
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  ctx.restore()
}

function drawTrace(ctx: CanvasRenderingContext2D, view: Viewport, engine: SprayEngine): void {
  const tr = engine.trace
  if (tr.length < 2) return
  ctx.save()
  ctx.strokeStyle = 'rgba(74, 222, 128, 0.85)'
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const p0 = toScreen(view, tr[0])
  ctx.moveTo(p0.x, p0.y)
  for (let i = 1; i < tr.length; i++) {
    const p = toScreen(view, tr[i])
    ctx.lineTo(p.x, p.y)
  }
  ctx.stroke()
  ctx.restore()
}

function drawRecentTrail(ctx: CanvasRenderingContext2D, view: Viewport, engine: SprayEngine, now: number): void {
  const tr = engine.trace
  if (tr.length < 2) return
  const windowMs = 350
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineWidth = 2
  let prev = toScreen(view, tr[tr.length - 1])
  for (let i = tr.length - 2; i >= 0; i--) {
    const age = now - tr[i].t
    if (age > windowMs) break
    const p = toScreen(view, tr[i])
    ctx.strokeStyle = `rgba(74, 222, 128, ${(0.5 * (1 - age / windowMs)).toFixed(3)})`
    line(ctx, prev.x, prev.y, p.x, p.y)
    prev = p
  }
  ctx.restore()
}

function drawLaser(ctx: CanvasRenderingContext2D, view: Viewport, engine: SprayEngine, now: number, alpha: number): void {
  const ideal = toScreen(view, engine.idealAt(now))
  ctx.save()
  ctx.globalAlpha = alpha

  ctx.lineCap = 'round'
  const steps = 10
  let prev = ideal
  for (let i = 1; i <= steps; i++) {
    const t = now - (i * 90) / steps
    if (t < engine.t0) break
    const p = toScreen(view, engine.idealAt(t))
    ctx.strokeStyle = `rgba(232, 121, 249, ${(0.55 * (1 - i / steps)).toFixed(3)})`
    ctx.lineWidth = 6 * (1 - i / steps) + 1
    line(ctx, prev.x, prev.y, p.x, p.y)
    prev = p
  }

  const beam = ctx.createLinearGradient(ideal.x, 0, ideal.x, ideal.y)
  beam.addColorStop(0, 'rgba(232, 121, 249, 0)')
  beam.addColorStop(1, 'rgba(232, 121, 249, 0.35)')
  ctx.strokeStyle = beam
  ctx.lineWidth = 1.5
  line(ctx, ideal.x, 0, ideal.x, ideal.y)

  const glow = ctx.createRadialGradient(ideal.x, ideal.y, 0, ideal.x, ideal.y, 22)
  glow.addColorStop(0, 'rgba(232, 121, 249, 0.9)')
  glow.addColorStop(1, 'rgba(232, 121, 249, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(ideal.x, ideal.y, 22, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = LASER_CORE
  ctx.beginPath()
  ctx.arc(ideal.x, ideal.y, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawPulses(ctx: CanvasRenderingContext2D, view: Viewport, pulses: Pulse[], now: number): void {
  const life = 420
  ctx.save()
  for (const p of pulses) {
    const age = now - p.t
    if (age < 0 || age > life) continue
    const k = age / life
    const s = toScreen(view, p.pos)
    ctx.beginPath()
    ctx.arc(s.x, s.y, 6 + k * 34, 0, Math.PI * 2)
    ctx.strokeStyle = GRADE_COLORS[p.grade]
    ctx.globalAlpha = (1 - k) * 0.9
    ctx.lineWidth = 3 * (1 - k) + 0.5
    ctx.stroke()
  }
  ctx.restore()
}

function drawCrosshair(ctx: CanvasRenderingContext2D, p: Vec2, running: boolean, accurate = true): void {
  ctx.save()
  ctx.strokeStyle = accurate ? CROSSHAIR : '#fb7185'
  ctx.lineWidth = 2
  ctx.shadowColor = 'rgba(0,0,0,0.9)'
  ctx.shadowBlur = 2
  const gap = 4
  const len = 9
  line(ctx, p.x - gap - len, p.y, p.x - gap, p.y)
  line(ctx, p.x + gap, p.y, p.x + gap + len, p.y)
  line(ctx, p.x, p.y - gap - len, p.x, p.y - gap)
  line(ctx, p.x, p.y + gap, p.x, p.y + gap + len)
  if (running) {
    ctx.fillStyle = accurate ? CROSSHAIR : '#fb7185'
    ctx.fillRect(p.x - 1, p.y - 1, 2, 2)
  }
  ctx.restore()
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  w: number,
  _h: number,
  engine: SprayEngine,
  judgments: Judgment[],
  now: number,
): void {
  ctx.save()
  ctx.textBaseline = 'top'

  const fired = engine.status === 'idle' ? 0 : engine.shots.length
  ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = 'rgba(226, 232, 240, 0.8)'
  ctx.textAlign = 'right'
  ctx.fillText(`${fired} / ${engine.bullets}`, w - 16, 14)

  if (engine.game === 'transfer' && engine.status !== 'idle') {
    ctx.fillStyle = 'rgba(244, 114, 182, 0.9)'
    ctx.fillText(`${engine.hits.filter((h) => h >= 4).length}/${engine.targets.length} kills`, w - 16, 34)
  }

  if (engine.status !== 'idle' && engine.combo >= 2) {
    const y = engine.game === 'transfer' ? 54 : 34
    ctx.font = '800 28px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = '#f8fafc'
    ctx.fillText(`x${engine.combo}`, w - 16, y)
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = 'rgba(148, 163, 184, 0.9)'
    ctx.fillText('COMBO', w - 16, y + 32)
  }

  drawJudgmentPop(ctx, w, judgments, now)
  ctx.restore()
}

function drawJudgmentPop(ctx: CanvasRenderingContext2D, w: number, judgments: Judgment[], now: number): void {
  const last = judgments[judgments.length - 1]
  if (!last) return
  const age = now - last.t
  const life = 520
  if (age < 0 || age >= life) return
  const k = age / life
  const scale = 1 + 0.35 * Math.max(0, 1 - age / 120)
  ctx.save()
  ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1
  ctx.translate(w / 2, 22)
  ctx.scale(scale, scale)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.font = '900 26px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = GRADE_COLORS[last.grade]
  ctx.shadowColor = 'rgba(0,0,0,0.8)'
  ctx.shadowBlur = 8
  ctx.fillText(last.label ?? GRADE_LABELS[last.grade], 0, 0)
  ctx.restore()
}

function drawKeyHud(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  keys: { a: boolean; d: boolean },
  speedFrac: number,
): void {
  const accurate = speedFrac <= ACCURATE_SPEED_FRACTION
  const box = (label: string, on: boolean, x: number) => {
    ctx.fillStyle = on ? (label === 'A' ? 'rgba(56,189,248,0.35)' : 'rgba(251,146,60,0.35)') : 'rgba(255,255,255,0.06)'
    ctx.strokeStyle = on ? (label === 'A' ? '#38bdf8' : '#fb923c') : 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 2
    roundRect(ctx, x, h - 52, 44, 36, 8)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = on ? '#fff' : 'rgba(255,255,255,0.45)'
    ctx.font = '800 16px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + 22, h - 34)
  }
  ctx.save()
  box('A', keys.a, w / 2 - 52)
  box('D', keys.d, w / 2 + 8)
  ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = accurate ? '#4ade80' : '#fb7185'
  ctx.textAlign = 'center'
  ctx.fillText(accurate ? 'QUIETO · PRECISIÓN' : 'EN MOVIMIENTO · DISPERSIÓN', w / 2, h - 58)
  ctx.restore()
}

function drawSpeedBar(ctx: CanvasRenderingContext2D, w: number, _h: number, speedFrac: number): void {
  const bw = Math.min(220, w * 0.4)
  const x = (w - bw) / 2
  const y = 16
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  roundRect(ctx, x, y, bw, 10, 5)
  ctx.fill()
  const fill = Math.min(1, speedFrac) * bw
  ctx.fillStyle = speedFrac > ACCURATE_SPEED_FRACTION ? '#fb7185' : '#4ade80'
  roundRect(ctx, x, y, fill, 10, 5)
  ctx.fill()
  // umbral 34%
  const tx = x + ACCURATE_SPEED_FRACTION * bw
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(tx - 1, y - 2, 2, 14)
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('34%', tx, y + 22)
  ctx.restore()
}

function drawStrafeHighway(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  chart: StrafeChart,
  rel: number,
  engine: StrafeEngine,
): void {
  const hitY = h * 0.72
  const pxPerMs = h / 2800
  const lanes = {
    a: w * 0.28,
    fire: w * 0.5,
    d: w * 0.72,
  }
  const laneW = Math.min(72, w * 0.12)

  ctx.save()
  // líneas de carril
  ctx.strokeStyle = 'rgba(148,163,184,0.15)'
  for (const x of Object.values(lanes)) line(ctx, x, 40, x, h - 60)
  // línea de golpe
  ctx.strokeStyle = 'rgba(248,250,252,0.55)'
  ctx.lineWidth = 2
  line(ctx, w * 0.15, hitY, w * 0.85, hitY)
  ctx.fillStyle = 'rgba(248,250,252,0.7)'
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('AHORA', w * 0.15, hitY - 6)

  const drawNote = (n: ChartNote) => {
    const y1 = hitY - (n.start - rel) * pxPerMs
    const y2 = hitY - (n.end - rel) * pxPerMs
    if (y2 > h + 40 || y1 < -40) return
    if (n.kind === 'hold' || n.kind === 'counter') {
      const x = lanes[n.key]
      const top = Math.min(y1, y2)
      const bot = Math.max(y1, y2)
      const past = rel > n.end
      const active = rel >= n.start && rel <= n.end
      const isCounter = n.kind === 'counter'
      ctx.fillStyle = past
        ? 'rgba(148,163,184,0.25)'
        : n.key === 'a'
          ? active
            ? 'rgba(56,189,248,0.85)'
            : 'rgba(56,189,248,0.45)'
          : active
            ? 'rgba(251,146,60,0.85)'
            : 'rgba(251,146,60,0.45)'
      roundRect(ctx, x - laneW / 2, top, laneW, Math.max(isCounter ? 18 : 12, bot - top), 8)
      ctx.fill()
      if (isCounter) {
        ctx.strokeStyle = active ? '#f8fafc' : 'rgba(248,250,252,0.55)'
        ctx.lineWidth = 2
        ctx.stroke()
      }
      ctx.fillStyle = '#fff'
      ctx.font = isCounter ? '800 14px ui-sans-serif, system-ui, sans-serif' : '800 18px ui-sans-serif, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(isCounter ? `${n.key.toUpperCase()} CS` : n.key.toUpperCase(), x, (top + bot) / 2)
    } else {
      const x = lanes.fire
      const top = Math.min(y1, y2)
      const bot = Math.max(y1, y2)
      const wstate = engine.windows[n.window]
      const done = wstate?.judged
      ctx.fillStyle = done ? 'rgba(34,211,238,0.25)' : 'rgba(232,121,249,0.4)'
      roundRect(ctx, x - laneW / 2, top, laneW, Math.max(16, bot - top), 8)
      ctx.fill()
      ctx.strokeStyle = 'rgba(232,121,249,0.9)'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = '#fdf4ff'
      ctx.font = '700 12px ui-sans-serif, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`FIRE ×${n.bullets}`, x, (top + bot) / 2)
    }
  }

  for (const n of chart.notes) drawNote(n)
  ctx.restore()
}

function drawStrafeHud(
  ctx: CanvasRenderingContext2D,
  w: number,
  _h: number,
  engine: StrafeEngine,
  judgments: Judgment[],
  now: number,
): void {
  ctx.save()
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = 'rgba(226,232,240,0.85)'
  ctx.fillText(`${engine.shots.length}/${engine.plannedBullets}`, w - 16, 14)
  if (engine.combo >= 2) {
    ctx.font = '800 28px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = '#f8fafc'
    ctx.fillText(`x${engine.combo}`, w - 16, 34)
  }
  drawJudgmentPop(ctx, w, judgments, now)
  ctx.restore()
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

function polyline(ctx: CanvasRenderingContext2D, pts: Vec2[]): void {
  if (pts.length === 0) return
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.stroke()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}
