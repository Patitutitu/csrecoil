import { describe, expect, it } from 'vitest'
import { WEAPONS, WEAPON_BY_ID } from '@/data/weapons'
import {
  bpmForCycle,
  compensationPath,
  cs2HorizontalFovDeg,
  degToCm,
  degToCounts,
  displayPixelsPerDegree,
  maxFitViewZoom,
  mouseDeltaToViewDeg,
  pixelsPerDegree,
} from '@/lib/units'
import { comboMultiplier, gradeForError, summarize } from './scoring'
import { computeViewport, toScreen } from './render'
import { SprayEngine } from './sprayEngine'

describe('datos de armas', () => {
  it('cada arma tiene cadencia real, patrón completo y velocidad máxima', () => {
    for (const w of WEAPONS) {
      expect(Math.round(60000 / w.cycleMs)).toBeCloseTo(w.rpm, -1)
      expect(w.pattern.length).toBe(w.magazine)
      expect(w.pattern[0]).toEqual({ x: 0, y: 0 })
      expect(w.maxSpeed).toBeGreaterThan(180)
      expect(w.maxSpeed).toBeLessThanOrEqual(250)
    }
  })

  it('AK-47 100 ms, M4A4 90 ms, SG 553 110 ms', () => {
    expect(WEAPON_BY_ID.ak47.cycleMs).toBe(100)
    expect(WEAPON_BY_ID.m4a4.cycleMs).toBe(90)
    expect(WEAPON_BY_ID.sg553.cycleMs).toBe(110)
    expect(WEAPON_BY_ID.m4a1s.magazine).toBe(20)
    expect(WEAPON_BY_ID.galil.magazine).toBe(35)
  })

  it('subfusiles y M249 con su cadencia real', () => {
    const expected: Record<string, [number, number]> = {
      mac10: [75, 30],
      mp9: [70, 30],
      mp7: [80, 30],
      ump45: [90, 25],
      p90: [70, 50],
      bizon: [80, 64],
      m249: [80, 100],
    }
    for (const [id, [cycle, mag]] of Object.entries(expected)) {
      expect(WEAPON_BY_ID[id].cycleMs).toBe(cycle)
      expect(WEAPON_BY_ID[id].magazine).toBe(mag)
    }
    expect(WEAPONS).toHaveLength(14)
  })

  it('la AK sube ~11.8° con pico al final y deriva izquierda-derecha-izquierda', () => {
    const ak = WEAPON_BY_ID.ak47
    const ys = ak.pattern.map((p) => p.y)
    const peak = ys.indexOf(Math.max(...ys)) + 1
    expect(peak).toBeGreaterThanOrEqual(24)
    expect(peak).toBeLessThanOrEqual(28)
    expect(Math.max(...ys)).toBeGreaterThan(11.5)
    expect(Math.max(...ys)).toBeLessThan(12)
    // impactos: primero a la izquierda (balas 6-9), luego a la derecha (10-15), luego a la izquierda (20-26) y cierra a la derecha (30)
    expect(ak.pattern[7].x).toBeLessThan(-1.2)
    expect(ak.pattern[13].x).toBeGreaterThan(4)
    expect(ak.pattern[19].x).toBeLessThan(-2.5)
    expect(ak.pattern[29].x).toBeGreaterThan(3)
    const xs = ak.pattern.map((p) => p.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(7.1, 0)
  })
})

describe('unidades', () => {
  it('AK completa a sens 2 ≈ 267 counts de pull-down', () => {
    const ak = WEAPON_BY_ID.ak47
    const maxPitch = Math.max(...ak.pattern.map((p) => p.y))
    expect(Math.round(degToCounts(maxPitch, 2))).toBe(267)
  })

  it('254 counts a 800 DPI son ~8 mm de mousepad', () => {
    const cm = degToCm(11.18, 2, 800)
    expect(cm).toBeGreaterThan(0.78)
    expect(cm).toBeLessThan(0.83)
  })

  it('mover el mouse hacia abajo baja la vista', () => {
    const d = mouseDeltaToViewDeg(0, 10, 1)
    expect(d.y).toBeCloseTo(-0.22)
    expect(d.x).toBe(0)
  })

  it('la compensación es el patrón invertido', () => {
    const ak = WEAPON_BY_ID.ak47
    const path = compensationPath(ak, 4)
    expect(path).toHaveLength(4)
    expect(path[3].y).toBeCloseTo(-ak.pattern[3].y)
    expect(path[3].x).toBeCloseTo(-ak.pattern[3].x)
  })

  it('tempo equivalente: AK 150 BPM, M4A4 166.7 BPM', () => {
    expect(bpmForCycle(100)).toBeCloseTo(150)
    expect(bpmForCycle(90)).toBeCloseTo(166.67, 1)
  })

  it('FOV Source hor+: 90 en 16:9 ≈ 106,26°', () => {
    expect(cs2HorizontalFovDeg(16 / 9, 90)).toBeCloseTo(106.26, 1)
    expect(cs2HorizontalFovDeg(4 / 3, 90)).toBeCloseTo(90, 2)
  })

  it('px/° en 1920×1080 FOV 90 ≈ 12,57 (focal 720, no promedio)', () => {
    const ppd = pixelsPerDegree(1920, 1080, 90)
    expect(ppd).toBeCloseTo(12.566, 2)
    // 1600×900: focal 600, como en la medición de videos
    expect(pixelsPerDegree(1600, 900, 90)).toBeCloseTo(10.472, 2)
  })

  it('escala de canvas = px/° del juego × (ancho canvas / res) × zoom', () => {
    const game = pixelsPerDegree(1920, 1080, 90)
    expect(displayPixelsPerDegree(960, 1920, 1080, 90)).toBeCloseTo(game * 0.5, 5)
    expect(displayPixelsPerDegree(960, 1920, 1080, 90, 2.5)).toBeCloseTo(game * 0.5 * 2.5, 5)
  })
})

describe('viewport simulador', () => {
  it('el origen del recoil (0,0) queda en el centro de la pantalla', () => {
    const view = computeViewport(800, 450, [], { resWidth: 1920, resHeight: 1080, fov: 90 })
    expect(view.anchor).toEqual({ x: 400, y: 225 })
    const origin = toScreen(view, { x: 0, y: 0 })
    expect(origin).toEqual({ x: 400, y: 225 })
  })

  it('no estira el patrón: ppd es la de CS2 a escala, no fit-to-screen', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 0, y: -12 },
    ]
    const view = computeViewport(960, 540, path, { resWidth: 1920, resHeight: 1080, fov: 90 })
    expect(view.ppd).toBeCloseTo(pixelsPerDegree(1920, 1080, 90) * 0.5, 5)
    // 12° de pull-down ≈ 75 px en un canvas a mitad de 1080p — no llena la altura
    const tip = toScreen(view, { x: 0, y: -12 })
    expect(tip.y - view.anchor.y).toBeCloseTo(12 * view.ppd, 5)
    expect(Math.abs(tip.y - view.anchor.y)).toBeLessThan(540 * 0.35)
  })

  it('viewZoom agranda el gráfico; sin path el ancla queda al centro', () => {
    const view = computeViewport(960, 540, [], {
      resWidth: 1920,
      resHeight: 1080,
      fov: 90,
      viewZoom: 2.5,
    })
    expect(view.anchor).toEqual({ x: 480, y: 270 })
    expect(view.ppd).toBeCloseTo(pixelsPerDegree(1920, 1080, 90) * 0.5 * 2.5, 5)
  })

  it('con zoom alto el ancla sube para que el pull-down entre en pantalla', () => {
    const path = compensationPath(WEAPON_BY_ID.ak47, 30)
    const view = computeViewport(1000, 562, path, {
      resWidth: 1600,
      resHeight: 900,
      fov: 90,
      viewZoom: 4,
    })
    // Preferiría y=281; al no entrar, baja el ancla? No: sube (menor y) para dar espacio abajo.
    expect(view.anchor.y).toBeLessThan(562 / 2)
    const tip = toScreen(view, path[path.length - 1])
    expect(tip.y).toBeLessThanOrEqual(562 - 50)
    const origin = toScreen(view, { x: 0, y: 0 })
    expect(origin.y).toBeGreaterThan(40)
  })

  it('en canvas chico el zoom de encaje baja; en ~1000×562 a 1600×900 entra hasta 4×', () => {
    const path = compensationPath(WEAPON_BY_ID.ak47, 30)
    expect(maxFitViewZoom(1000, 562, path, 1600, 900, 90)).toBeGreaterThanOrEqual(3.5)
    // Mitad de alto: hay que bajar el zoom
    expect(maxFitViewZoom(1000, 280, path, 1600, 900, 90)).toBeLessThan(3)
  })
})

describe('scoring', () => {
  it('califica por umbrales en grados', () => {
    expect(gradeForError(0.1)).toBe('perfect')
    expect(gradeForError(0.3)).toBe('perfect')
    expect(gradeForError(0.5)).toBe('great')
    expect(gradeForError(0.9)).toBe('good')
    expect(gradeForError(1.5)).toBe('miss')
  })

  it('el combo multiplica hasta x2', () => {
    expect(comboMultiplier(0)).toBe(1)
    expect(comboMultiplier(5)).toBeCloseTo(1.5)
    expect(comboMultiplier(10)).toBeCloseTo(2)
    expect(comboMultiplier(25)).toBeCloseTo(2)
  })
})

function makeEngine(weaponId: string, mode: 'first4' | 'first9' | 'full', sens = 1) {
  return new SprayEngine({ weapon: WEAPON_BY_ID[weaponId], mode, guide: 'guided', sensitivity: sens, dpi: 800 })
}

describe('SprayEngine', () => {
  it('dispara exactamente cada cycleMs y nunca antes', () => {
    for (const id of ['ak47', 'm4a4', 'sg553']) {
      const e = makeEngine(id, 'full')
      const cycle = e.cycleMs
      e.press(1000)
      expect(e.shots).toHaveLength(1)
      e.update(1000 + cycle - 0.01)
      expect(e.shots).toHaveLength(1)
      e.update(1000 + cycle)
      expect(e.shots).toHaveLength(2)
      e.update(1000 + cycle * 7.5)
      expect(e.shots).toHaveLength(8)
      for (let i = 1; i < e.shots.length; i++) {
        expect(e.shots[i].timeMs - e.shots[i - 1].timeMs).toBeCloseTo(cycle, 6)
      }
    }
  })

  it('seguir la trayectoria ideal da todo perfecto y nota S', () => {
    const e = makeEngine('ak47', 'first9', 1)
    const k = 0.022
    e.press(0)
    let pos = { x: 0, y: 0 }
    for (let i = 1; i < e.bullets; i++) {
      const t = i * e.cycleMs
      const target = e.path[i]
      const dx = (target.x - pos.x) / k
      const dy = -(target.y - pos.y) / k
      e.move(t - 1, dx, dy)
      pos = target
      e.update(t)
    }
    expect(e.status).toBe('finished')
    expect(e.result?.completed).toBe(true)
    expect(e.result?.game).toBe('recoil')
    expect(e.result?.shots.every((s) => s.grade === 'perfect')).toBe(true)
    expect(e.result?.shots.every((s) => Math.hypot(s.impact.x, s.impact.y) < 0.01)).toBe(true)
    expect(e.result?.grade).toBe('S')
    expect(e.result?.accuracy).toBeCloseTo(1)
    expect(e.result?.maxCombo).toBe(9)
  })

  it('modo custom respeta la cantidad elegida (acotada al cargador)', () => {
    const e = new SprayEngine({
      weapon: WEAPON_BY_ID.ak47,
      mode: 'custom',
      guide: 'guided',
      sensitivity: 1,
      dpi: 800,
      customBullets: 12,
    })
    expect(e.bullets).toBe(12)
    expect(e.path).toHaveLength(12)
    const over = new SprayEngine({
      weapon: WEAPON_BY_ID.m4a1s,
      mode: 'custom',
      guide: 'guided',
      sensitivity: 1,
      dpi: 800,
      customBullets: 99,
    })
    expect(over.bullets).toBe(20)
  })

  it('spray transfer pone objetivos en X y pide 4 balas por pecho', () => {
    const e = new SprayEngine({
      weapon: WEAPON_BY_ID.ak47,
      mode: 't2',
      guide: 'guided',
      sensitivity: 1,
      dpi: 800,
      game: 'transfer',
      seed: 1,
    })
    expect(e.bullets).toBe(8)
    expect(e.targets).toHaveLength(2)
    expect(e.targets[0].y).toBe(0)
    expect(e.offsets[0]).toEqual(e.targets[0])
    expect(e.offsets[4]).toEqual(e.targets[1])
  })

  it('no mover el mouse en el cargador completo falla casi todas las balas', () => {
    const e = makeEngine('ak47', 'full')
    e.press(0)
    e.update(10_000)
    expect(e.status).toBe('finished')
    const misses = e.shots.filter((s) => s.grade === 'miss').length
    expect(misses).toBeGreaterThan(25)
    expect(e.result?.grade).toBe('D')
  })

  it('soltar antes corta la ráfaga y la marca como incompleta', () => {
    const e = makeEngine('m4a4', 'first9')
    e.press(0)
    e.update(185)
    expect(e.shots).toHaveLength(3)
    const events = e.release(200)
    expect(events.at(-1)?.type).toBe('finished')
    expect(e.result?.completed).toBe(false)
    expect(e.result?.shots).toHaveLength(3)
    expect(e.result?.accuracy).toBeLessThanOrEqual(3 / 9 + 1e-9)
  })

  it('interpola la posición del mouse en el instante del disparo', () => {
    const e = makeEngine('ak47', 'first4')
    e.press(0)
    e.move(50, 0, 100)
    e.move(150, 0, 100)
    e.update(100)
    const s = e.shots[1]
    expect(s.actual.y).toBeCloseTo(-3.3, 5)
  })

  it('idealAt interpola linealmente entre balas', () => {
    const e = makeEngine('ak47', 'first4')
    e.press(0)
    const mid = e.idealAt(50)
    expect(mid.y).toBeCloseTo((e.path[0].y + e.path[1].y) / 2)
    expect(e.idealAt(10_000)).toEqual(e.path[3])
  })

  it('summarize con lista vacía no divide por cero', () => {
    expect(summarize([], 0).accuracy).toBe(0)
  })
})
