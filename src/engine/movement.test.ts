import { describe, expect, it } from 'vitest'
import { ACCURATE_SPEED_FRACTION, Movement, stopTimeMs, stepVelocity, TICK_MS } from './movement'
import { buildStrafeChart } from '@/lib/strafeChart'
import { WEAPON_BY_ID } from '@/data/weapons'
import { transferTargets, transferOffsets, HITS_TO_KILL } from '@/lib/transfer'
import { movingSpreadDeg } from './sprayEngine'

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
  it('alterna holds A/D y ventanas FIRE a tempo del arma', () => {
    const ak = WEAPON_BY_ID.ak47
    const chart = buildStrafeChart(ak, 'burst', 7)
    expect(chart.windows).toBe(8)
    expect(chart.bulletsPerWindow).toBe(4)
    expect(chart.beatMs).toBe(ak.cycleMs * 4)
    const holds = chart.notes.filter((n) => n.kind === 'hold')
    const fires = chart.notes.filter((n) => n.kind === 'fire')
    expect(holds).toHaveLength(8)
    expect(fires).toHaveLength(8)
    expect(holds[0].key).not.toBe(holds[1].key)
  })
})
