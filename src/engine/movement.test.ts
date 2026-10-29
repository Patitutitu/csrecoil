import { describe, expect, it } from 'vitest'
import { ACCURATE_SPEED_FRACTION, Movement, stopTimeMs, stepVelocity, TICK_MS } from './movement'
import { buildStrafeChart } from '@/lib/strafeChart'
import { WEAPON_BY_ID } from '@/data/weapons'
import { transferTargets, transferOffsets, HITS_TO_KILL } from '@/lib/transfer'
import { movingSpreadDeg } from './sprayEngine'
import { StrafeEngine } from './strafeEngine'

describe('movimiento CS2', () => {
  it('a máxima velocidad, soltar sin counter tarda ~200 ms en caer bajo 34%', () => {
    const ms = stopTimeMs(250, false)
    expect(ms).toBeGreaterThan(150)
    expect(ms).toBeLessThan(280)
  })

  it('counter-strafe frena en ~80 ms', () => {
    const ms = stopTimeMs(250, true)
    expect(ms).toBeGreaterThan(40)
    expect(ms).toBeLessThan(120)
  })

  it('Movement acumula velocidad con A/D y detecta precisión', () => {
    const m = new Movement(215)
    m.setKey(0, 'd', true)
    m.advance(500)
    expect(m.speedFracAt(500)).toBeGreaterThan(0.9)
    expect(m.isAccurateAt(500)).toBe(false)
    m.setKey(500, 'd', false)
    m.setKey(500, 'a', true)
    m.advance(500 + 100)
    expect(m.isAccurateAt(500 + 100)).toBe(true)
  })

  it('stepVelocity no pasa la velocidad máxima', () => {
    let v = 0
    for (let i = 0; i < 200; i++) v = stepVelocity(v, 1, 215, TICK_MS / 1000)
    expect(Math.abs(v)).toBeLessThanOrEqual(215 + 0.01)
  })

  it('la dispersión por movimiento es 0 bajo el umbral', () => {
    expect(movingSpreadDeg(ACCURATE_SPEED_FRACTION)).toBe(0)
    expect(movingSpreadDeg(1)).toBeGreaterThan(3)
  })
})

describe('spray transfer', () => {
  it('genera N objetivos en y=0 con gaps entre 2° y 4.5°', () => {
    const t = transferTargets(42, 3)
    expect(t).toHaveLength(3)
    expect(t[0]).toEqual({ x: 0, y: 0 })
    expect(t.every((p) => p.y === 0)).toBe(true)
    const gap = Math.abs(t[1].x - t[0].x)
    expect(gap).toBeGreaterThanOrEqual(2)
    expect(gap).toBeLessThanOrEqual(4.5)
    expect(transferOffsets(t)).toHaveLength(3 * HITS_TO_KILL)
  })

  it('mismo seed → mismos objetivos', () => {
    expect(transferTargets(99, 5)).toEqual(transferTargets(99, 5))
  })
})

describe('strafe chart', () => {
  it('es AAAA → counter opuesto → FIRE (nunca disparar solo con una tecla)', () => {
    const ak = WEAPON_BY_ID.ak47
    const chart = buildStrafeChart(ak, 'burst', 7, 4)
    expect(chart.windows).toBe(8)
    expect(chart.bulletsPerWindow).toBe(4)
    expect(chart.beatMs).toBe(ak.cycleMs * 4)
    const holds = chart.notes.filter((n) => n.kind === 'hold')
    const counters = chart.notes.filter((n) => n.kind === 'counter')
    const fires = chart.notes.filter((n) => n.kind === 'fire')
    expect(holds).toHaveLength(8)
    expect(counters).toHaveLength(8)
    expect(fires).toHaveLength(8)
    // hold A → counter D → fire; el siguiente hold es D
    expect(counters[0].key).not.toBe(holds[0].key)
    expect(holds[1].key).toBe(counters[0].key)
    expect(holds[0].end).toBe(counters[0].start)
    expect(counters[0].end).toBe(fires[0].start)
  })

  it('burst respeta balas por FIRE (elegibles) y alarga la ventana', () => {
    const ak = WEAPON_BY_ID.ak47
    const short = buildStrafeChart(ak, 'burst', 1, 4)
    const long = buildStrafeChart(ak, 'burst', 1, 15)
    expect(short.bulletsPerWindow).toBe(4)
    expect(long.bulletsPerWindow).toBe(15)
    expect(long.durationMs).toBeGreaterThan(short.durationMs)
    expect(long.notes.filter((n) => n.kind === 'fire')[0].bullets).toBe(15)
    // tap siempre 1
    expect(buildStrafeChart(ak, 'tap', 1, 15).bulletsPerWindow).toBe(1)
  })
})

describe('strafe counter obligatorio', () => {
  it('rechaza disparar sin tecla opuesta y acepta AAAADDDD', () => {
    const move = new Movement(215)
    const eng = new StrafeEngine({
      weapon: WEAPON_BY_ID.ak47,
      mode: 'tap',
      guide: 'guided',
      sensitivity: 1,
      dpi: 800,
      seed: 1,
      movement: move,
    })
    eng.press(0)
    const fire = eng.fireNotes[0]
    const counter = eng.chart.notes.find((n) => n.kind === 'counter' && n.window === 0)
    expect(counter).toBeTruthy()
    const hold = eng.holdNotes[0]
    // Solo A durante el hold, sin D → en la ventana FIRE el disparo falla
    move.setKey(50, hold.key, true)
    move.advance(hold.end)
    move.setKey(hold.end, hold.key, false)
    const bad = eng.press(eng.t0 + fire.start + 10)
    expect(bad.some((e) => e.type === 'pop' && e.label.includes('SIN COUNTER'))).toBe(true)
    expect(eng.windows[0].burst).toBeNull()

    // Misma ventana pero ahora con counter opuesto → OK
    move.setKey(eng.t0 + (counter as { start: number }).start + 5, (counter as { key: 'a' | 'd' }).key, true)
    move.advance(eng.t0 + fire.start + 40)
    move.setKey(eng.t0 + fire.start + 35, (counter as { key: 'a' | 'd' }).key, false)
    const good = eng.press(eng.t0 + fire.start + 50)
    expect(good.some((e) => e.type === 'pop' && e.label.includes('SIN COUNTER'))).toBe(false)
    expect(eng.windows[0].burst).not.toBeNull()
    expect(eng.windows[0].counter).toBe(true)
  })
})
