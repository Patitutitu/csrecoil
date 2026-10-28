import { degToCm, degToCounts } from '@/lib/units'
import { GRADE_THRESHOLDS } from './scoring'
import type { RunResult, ShotResult, Vec2 } from './types'

export type BiasLabel = 'faltó bajar' | 'bajaste de más' | 'muy a la derecha' | 'muy a la izquierda'

export interface SegmentAdvice {
  from: number
  to: number
  meanDy: number
  meanDx: number
  meanSpeedRatio: number | null
  tip: string
}

export interface CoachReport {
  meanError: number
  meanDx: number
  meanDy: number
  /** Velocidad vertical media real / ideal (1 = timing perfecto). */
  meanSpeedRatio: number | null
  early: number
  late: number
  perfect: number
  segments: SegmentAdvice[]
  tips: string[]
  /** Pull-down total que te faltó o te sobró, en grados (positivo = faltó bajar). */
  pullBiasDeg: number
  pullBiasCm: number
  pullBiasCounts: number
  worst: ShotResult[]
}

/** Compara la velocidad vertical entre balas consecutivas con la ideal. */
function verticalSpeedRatio(shots: ShotResult[]): { ratios: number[]; early: number; late: number } {
  const ratios: number[] = []
  let early = 0
  let late = 0
  for (let i = 1; i < shots.length; i++) {
    const a = shots[i - 1]
    const b = shots[i]
    const dt = b.timeMs - a.timeMs
    if (dt <= 0) continue
    const idealDy = b.target.y - a.target.y
    const actualDy = b.actual.y - a.actual.y
    if (Math.abs(idealDy) < 0.05) continue
    const r = actualDy / idealDy
    ratios.push(r)
    // Ideal y baja (target.y más negativo). Si actualDy es más negativo que ideal → bajaste más rápido (early).
    if (r > 1.15) early += 1
    else if (r < 0.85) late += 1
  }
  return { ratios, early, late }
}

function segmentTip(meanDy: number, meanDx: number, meanSpeedRatio: number | null): string {
  const parts: string[] = []
  if (meanSpeedRatio !== null) {
    if (meanSpeedRatio > 1.15) parts.push('bajás demasiado rápido en este tramo')
    else if (meanSpeedRatio < 0.85) parts.push('vas atrasado: el pull-down llega tarde')
  }
  if (Math.abs(meanDy) > 0.15) {
    parts.push(meanDy > 0 ? 'te falta bajar' : 'bajás de más')
  }
  if (Math.abs(meanDx) > 0.15) {
    parts.push(meanDx > 0 ? 'deriva a la derecha' : 'deriva a la izquierda')
  }
  if (!parts.length) return 'Este tramo está sólido: mantené el ritmo'
  return parts.join(' · ')
}

export function analyzeRun(result: RunResult, sensitivity: number, dpi: number): CoachReport {
  const shots = result.shots
  const n = shots.length
  if (!n) {
    return {
      meanError: 0,
      meanDx: 0,
      meanDy: 0,
      meanSpeedRatio: null,
      early: 0,
      late: 0,
      perfect: 0,
      segments: [],
      tips: ['Todavía no hay balas para analizar.'],
      pullBiasDeg: 0,
      pullBiasCm: 0,
      pullBiasCounts: 0,
      worst: [],
    }
  }

  let sumE = 0
  let sumDx = 0
  let sumDy = 0
  let perfect = 0
  for (const s of shots) {
    sumE += s.errorDeg
    const dx = s.actual.x - s.target.x
    const dy = s.actual.y - s.target.y
    sumDx += dx
    sumDy += dy
    if (s.grade === 'perfect') perfect += 1
  }
  const meanError = sumE / n
  const meanDx = sumDx / n
  const meanDy = sumDy / n
  const { ratios, early, late } = verticalSpeedRatio(shots)
  const meanSpeedRatio = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null

  const last = shots[n - 1]
  const pullBiasDeg = last.actual.y - last.target.y
  const pullBiasCounts = Math.round(degToCounts(Math.abs(pullBiasDeg), sensitivity))
  const pullBiasCm = degToCm(Math.abs(pullBiasDeg), sensitivity, dpi)

  const segSize = Math.max(3, Math.ceil(n / 3))
  const segments: SegmentAdvice[] = []
  for (let from = 0; from < n; from += segSize) {
    const to = Math.min(n, from + segSize)
    const slice = shots.slice(from, to)
    let sDx = 0
    let sDy = 0
    for (const s of slice) {
      sDx += s.actual.x - s.target.x
      sDy += s.actual.y - s.target.y
    }
    const { ratios: sr } = verticalSpeedRatio(slice)
    const meanSpeed = sr.length ? sr.reduce((a, b) => a + b, 0) / sr.length : null
    segments.push({
      from: from + 1,
      to,
      meanDy: sDy / slice.length,
      meanDx: sDx / slice.length,
      meanSpeedRatio: meanSpeed,
      tip: segmentTip(sDy / slice.length, sDx / slice.length, meanSpeed),
    })
  }

  const tips = buildTips({
    result,
    meanDx,
    meanDy,
    meanError,
    meanSpeedRatio,
    early,
    late,
    perfect,
    pullBiasDeg,
    pullBiasCm,
    pullBiasCounts,
    segments,
  })

  const worst = [...shots].sort((a, b) => b.errorDeg - a.errorDeg).slice(0, 5)

  return {
    meanError,
    meanDx,
    meanDy,
    meanSpeedRatio,
    early,
    late,
    perfect,
    segments,
    tips,
    pullBiasDeg,
    pullBiasCm,
    pullBiasCounts,
    worst,
  }
}

function buildTips(args: {
  result: RunResult
  meanDx: number
  meanDy: number
  meanError: number
  meanSpeedRatio: number | null
  early: number
  late: number
  perfect: number
  pullBiasDeg: number
  pullBiasCm: number
  pullBiasCounts: number
  segments: SegmentAdvice[]
}): string[] {
  const tips: string[] = []
  const {
    result,
    meanDx,
    meanDy,
    meanError,
    meanSpeedRatio,
    early,
    late,
    perfect,
    pullBiasDeg,
    pullBiasCm,
    pullBiasCounts,
    segments,
  } = args
  const n = result.shots.length

  if (result.strafe) {
    const s = result.strafe
    if (s.movingShots > 0) {
      tips.push(
        `${s.movingShots} balas salieron en movimiento (>34 % de velocidad): en CS2 pierden precisión. Frená con la tecla opuesta (counter-strafe) antes de disparar.`,
      )
    }
    if (s.meanStopMs !== null) {
      if (s.meanStopMs > 150) {
        tips.push(
          `Tardás ${Math.round(s.meanStopMs)} ms en frenar. Con counter-strafe (tecla opuesta) deberías quedar quieto en ~80 ms.`,
        )
      } else if (s.counterStrafes < s.windows) {
        tips.push(
          `Counter obligatorio: AAAA y disparar no vale. Tiene que ser AAAADDDD (tecla opuesta) y recién ahí FIRE. Completaste ${s.counterStrafes}/${s.windows}.`,
        )
      } else {
        tips.push(`Counter limpio: ${Math.round(s.meanStopMs)} ms de media · ${s.counterStrafes}/${s.windows}.`)
      }
    }
    if (s.holdSync < 0.75) {
      tips.push(`Sincronización A/D al ${Math.round(s.holdSync * 100)}%: mantené la tecla de la nota sostenida hasta el final.`)
    }
  }

  if (result.transfer) {
    const t = result.transfer
    tips.push(`Spray transfer: ${t.kills}/${t.targets} objetivos rotos (4 impactos al pecho cada uno).`)
    const unfinished = t.hits.findIndex((h) => h < 4)
    if (unfinished >= 0) {
      tips.push(
        `En el objetivo ${unfinished + 1} pegaste ${t.hits[unfinished]}/4. Mové en X recién cuando terminás las 4 del pecho anterior; la altura tiene que seguir en 0.`,
      )
    }
  }

  const moving = result.shots.filter((s) => s.moving).length
  if (moving > 0 && !result.strafe) {
    tips.push(`${moving} balas con dispersión por movimiento: soltá A/D y esperá a quedar quieto antes de tirar.`)
  }

  if (meanSpeedRatio !== null) {
    if (meanSpeedRatio > 1.2) {
      tips.push(
        `Bajás un ${Math.round((meanSpeedRatio - 1) * 100)} % más rápido de lo que sube el culatazo. El mouse tiene que llegar al punto justo cuando sale cada bala, no antes.`,
      )
    } else if (meanSpeedRatio < 0.8) {
      tips.push(
        `Vas un ${Math.round((1 - meanSpeedRatio) * 100)} % más lento que el pattern: las balas te ganan altura. Anticipá el pull-down entre balas.`,
      )
    }
  }

  if (early > late && early >= 2) {
    tips.push(`${early} tramos tempranos: llegás abajo antes de tiempo. Suavizá la bajada; no “tirés” el mouse.`)
  } else if (late > early && late >= 2) {
    tips.push(`${late} tramos tardíos: el pattern te gana. Empezá a bajar apenas sale la primera bala.`)
  }

  if (Math.abs(pullBiasDeg) > 0.25 && n >= 4) {
    const dir = pullBiasDeg > 0 ? 'más abajo' : 'menos abajo'
    tips.push(
      `Al final del spray te falta llevar el mouse ${dir}: ${pullBiasDeg > 0 ? '+' : '−'}${Math.abs(pullBiasDeg).toFixed(2)}° ≈ ${pullBiasCounts} counts ≈ ${pullBiasCm.toFixed(2)} cm en tu mousepad.`,
    )
  }

  if (Math.abs(meanDx) > 0.2) {
    tips.push(
      meanDx > 0
        ? 'Sesgo horizontal a la derecha: compensá más hacia la izquierda en los quiebres del patrón.'
        : 'Sesgo horizontal a la izquierda: compensá más hacia la derecha en los quiebres del patrón.',
    )
  }

  if (Math.abs(meanDy) > 0.2 && Math.abs(pullBiasDeg) <= 0.25) {
    tips.push(meanDy > 0 ? 'En promedio te falta bajar.' : 'En promedio bajás de más.')
  }

  const hard = segments.find((s) => Math.abs(s.meanDy) > 0.25 || Math.abs(s.meanDx) > 0.25)
  if (hard) {
    tips.push(`Foco en balas ${hard.from}–${hard.to}: ${hard.tip}.`)
  }

  if (perfect === n && meanError <= GRADE_THRESHOLDS.perfect) {
    tips.push('Spray perfecto. Subí de guía (Fade → Ciego) o probá spray transfer / strafe.')
  } else if (meanError <= GRADE_THRESHOLDS.great) {
    tips.push('Muy cerca del control perfecto. Repetí el mismo setup hasta clavar un S en ciego.')
  }

  if (!tips.length) tips.push('Sin sesgos claros: seguí practicando el mismo ritmo a cadencia real.')
  return tips.slice(0, 6)
}

export function describeError(dx: number, dy: number): string {
  const parts: string[] = []
  if (Math.abs(dy) > 0.15) parts.push(dy > 0 ? 'te faltó bajar' : 'bajaste de más')
  if (Math.abs(dx) > 0.15) parts.push(dx > 0 ? 'muy a la derecha' : 'muy a la izquierda')
  return parts.length ? `, ${parts.join(' y ')}` : ''
}

export function impactOffset(s: ShotResult): Vec2 {
  return { x: s.impact.x - s.targetPos.x, y: s.impact.y - s.targetPos.y }
}
