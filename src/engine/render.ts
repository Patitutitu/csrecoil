import type { SprayEngine } from './sprayEngine'
import type { HitGrade, Vec2 } from './types'

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
}

export interface Viewport {
  anchor: Vec2
  ppd: number
}

/** Encuadra la trayectoria del modo actual: el ancla arriba y la compensación cayendo hacia abajo. */
export function computeViewport(width: number, height: number, path: Vec2[]): Viewport {
  let maxDown = 0
  let maxSide = 0
  for (const p of path) {
    maxDown = Math.max(maxDown, -p.y)
    maxSide = Math.max(maxSide, Math.abs(p.x))
  }
  const spanY = Math.max(maxDown * 1.15, 3)
  const spanX = Math.max(maxSide * 1.35, 2.5)
  const padTop = height * 0.14
  const padBottom = height * 0.1
  const padX = width * 0.08
  const ppd = Math.min((height - padTop - padBottom) / spanY, (width - 2 * padX) / (2 * spanX))
  return { anchor: { x: width / 2, y: padTop }, ppd }
}

export function toScreen(v: Viewport, p: Vec2): Vec2 {
  return { x: v.anchor.x + p.x * v.ppd, y: v.anchor.y - p.y * v.ppd }
}

export function drawFrame(f: Frame): void {
  const { ctx, width, height, engine, now } = f
  const view = computeViewport(width, height, engine.path)

  drawBackground(ctx, width, height, view)

  const running = engine.status === 'running'
  const finished = engine.status === 'finished'
  const showGuide = f.reveal || f.guideAlpha > 0.001

  if (showGuide) {
    drawPath(ctx, view, engine, f.reveal ? 1 : f.guideAlpha, now)
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

  const playerPos = engine.status === 'idle' ? { x: 0, y: 0 } : engine.pos
  drawCrosshair(ctx, toScreen(view, playerPos), running)

  drawHud(ctx, width, height, engine, f.judgments, now)
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, view: Viewport): void {
  const g = ctx.createRadialGradient(w / 2, h * 0.35, 10, w / 2, h * 0.35, Math.max(w, h) * 0.8)
  g.addColorStop(0, '#171a2b')
  g.addColorStop(1, '#0a0b12')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // grilla de 1°
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
  // ejes del ancla
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)'
  line(ctx, view.anchor.x, 0, view.anchor.x, h)
  line(ctx, 0, view.anchor.y, w, view.anchor.y)
  ctx.restore()

  // referencia de escala
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
  ctx.restore()
}

function drawPath(ctx: CanvasRenderingContext2D, view: Viewport, engine: SprayEngine, alpha: number, now: number): void {
  const pts = engine.path.map((p) => toScreen(view, p))
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // halo
  ctx.strokeStyle = 'rgba(167, 139, 250, 0.25)'
  ctx.lineWidth = 8
  polyline(ctx, pts)
  // trazo
  ctx.strokeStyle = PATH
  ctx.lineWidth = 2
  polyline(ctx, pts)

  // nodos futuros
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

function drawJudgedNodes(ctx: CanvasRenderingContext2D, view: Viewport, engine: SprayEngine): void {
  ctx.save()
  for (const s of engine.shots) {
    const p = toScreen(view, s.target)
    ctx.beginPath()
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
    ctx.fillStyle = GRADE_COLORS[s.grade]
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = 'rgba(10, 11, 18, 0.9)'
    ctx.stroke()
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

  // cometa: últimos 90 ms de trayectoria ideal
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

  // haz vertical desde arriba (efecto láser)
  const beam = ctx.createLinearGradient(ideal.x, 0, ideal.x, ideal.y)
  beam.addColorStop(0, 'rgba(232, 121, 249, 0)')
  beam.addColorStop(1, 'rgba(232, 121, 249, 0.35)')
  ctx.strokeStyle = beam
  ctx.lineWidth = 1.5
  line(ctx, ideal.x, 0, ideal.x, ideal.y)

  // punto
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

function drawCrosshair(ctx: CanvasRenderingContext2D, p: Vec2, running: boolean): void {
  ctx.save()
  ctx.strokeStyle = CROSSHAIR
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
    ctx.fillStyle = CROSSHAIR
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

  // contador de balas
  const fired = engine.status === 'idle' ? 0 : engine.shots.length
  ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = 'rgba(226, 232, 240, 0.8)'
  ctx.textAlign = 'right'
  ctx.fillText(`${fired} / ${engine.bullets}`, w - 16, 14)

  // combo
  if (engine.status !== 'idle' && engine.combo >= 2) {
    ctx.font = '800 28px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = '#f8fafc'
    ctx.fillText(`x${engine.combo}`, w - 16, 34)
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = 'rgba(148, 163, 184, 0.9)'
    ctx.fillText('COMBO', w - 16, 66)
  }

  // última calificación con pop
  const last = judgments[judgments.length - 1]
  if (last) {
    const age = now - last.t
    const life = 520
    if (age >= 0 && age < life) {
      const k = age / life
      const scale = 1 + 0.35 * Math.max(0, 1 - age / 120)
      ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1
      ctx.translate(w / 2, 22)
      ctx.scale(scale, scale)
      ctx.textAlign = 'center'
      ctx.font = '900 26px ui-sans-serif, system-ui, sans-serif'
      ctx.fillStyle = GRADE_COLORS[last.grade]
      ctx.shadowColor = 'rgba(0,0,0,0.8)'
      ctx.shadowBlur = 8
      ctx.fillText(GRADE_LABELS[last.grade], 0, 0)
    }
  }
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
