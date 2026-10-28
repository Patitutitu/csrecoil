import { Target } from 'lucide-react'
import { GRADE_COLORS, GRADE_LABELS } from '@/engine/render'
import { GRADE_THRESHOLDS } from '@/engine/scoring'
import type { RunResult, WeaponDef } from '@/engine/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface ResultsPanelProps {
  result: RunResult | null
  weapon: WeaponDef
  best: RunResult | undefined
}

export function ResultsPanel({ result, weapon, best }: ResultsPanelProps) {
  if (!result) {
    return (
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle>Resultado</CardTitle>
          <CardDescription>Todavía no disparaste con esta configuración</CardDescription>
        </CardHeader>
        <CardContent className="px-4">
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-white/15 p-4 text-sm text-white/60">
            <Target className="size-5 shrink-0 text-fuchsia-300" />
            <p>
              Cada bala se califica por el error angular entre tu mira y el punto ideal:{' '}
              <span style={{ color: GRADE_COLORS.perfect }}>Perfecto ≤ {GRADE_THRESHOLDS.perfect}°</span>,{' '}
              <span style={{ color: GRADE_COLORS.great }}>Genial ≤ {GRADE_THRESHOLDS.great}°</span>,{' '}
              <span style={{ color: GRADE_COLORS.good }}>Bien ≤ {GRADE_THRESHOLDS.good}°</span>, el resto es fallo.
              El combo multiplica hasta x2.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const fired = result.shots.length
  const meanError = fired ? result.shots.reduce((a, s) => a + s.errorDeg, 0) / fired : 0
  const counts = result.shots.reduce(
    (acc, s) => {
      acc[s.grade] += 1
      return acc
    },
    { perfect: 0, great: 0, good: 0, miss: 0 },
  )
  const worst = [...result.shots].sort((a, b) => b.errorDeg - a.errorDeg).slice(0, 3)
  const maxErr = Math.max(1.2, ...result.shots.map((s) => s.errorDeg))
  const isBest = best?.id === result.id

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2">
          Resultado
          {isBest && <Badge className="bg-fuchsia-500/20 text-fuchsia-200">Nuevo récord</Badge>}
          {!result.completed && <Badge variant="outline" className="border-amber-400/40 text-amber-200">Ráfaga cortada</Badge>}
        </CardTitle>
        <CardDescription>
          {weapon.name} · {fired}/{result.bullets} balas · error medio {meanError.toFixed(2)}°
          {best && !isBest && ` · récord ${best.score.toLocaleString('es-AR')}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="grid grid-cols-4 gap-1.5">
          {(['perfect', 'great', 'good', 'miss'] as const).map((g) => (
            <div key={g} className="rounded-lg bg-white/[0.04] px-2 py-1.5 text-center">
              <div className="text-lg font-bold tabular-nums" style={{ color: GRADE_COLORS[g] }}>
                {counts[g]}
              </div>
              <div className="text-[10px] text-white/50">{GRADE_LABELS[g]}</div>
            </div>
          ))}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-white/50">
            <span>Error por bala (grados)</span>
            <span>{maxErr.toFixed(1)}° máx.</span>
          </div>
          <div className="flex h-16 items-end gap-[2px]">
            {Array.from({ length: result.bullets }, (_, i) => {
              const s = result.shots[i]
              if (!s) {
                return <div key={i} className="flex-1 rounded-sm bg-white/5" style={{ height: '6%' }} title={`Bala ${i + 1}: no disparada`} />
              }
              const h = Math.max(6, (s.errorDeg / maxErr) * 100)
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{ height: `${h}%`, backgroundColor: GRADE_COLORS[s.grade] }}
                  title={`Bala ${i + 1}: ${s.errorDeg.toFixed(2)}° · ${GRADE_LABELS[s.grade]}`}
                />
              )
            })}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-white/40">
            <span>1</span>
            <span>{result.bullets}</span>
          </div>
        </div>

        {worst.length > 0 && worst[0].errorDeg > GRADE_THRESHOLDS.perfect && (
          <div className="text-xs text-white/70">
            <span className="text-white/50">Dónde se te fue: </span>
            {worst.map((s, i) => (
              <span key={s.index}>
                {i > 0 && ', '}
                bala {s.index + 1} ({s.errorDeg.toFixed(2)}°
                {describeError(s.actual.x - s.target.x, s.actual.y - s.target.y)})
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function describeError(dx: number, dy: number): string {
  const parts: string[] = []
  if (Math.abs(dy) > 0.15) parts.push(dy > 0 ? 'te faltó bajar' : 'bajaste de más')
  if (Math.abs(dx) > 0.15) parts.push(dx > 0 ? 'muy a la derecha' : 'muy a la izquierda')
  return parts.length ? `, ${parts.join(' y ')}` : ''
}
