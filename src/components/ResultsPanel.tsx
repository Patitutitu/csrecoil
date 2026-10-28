import { Target, Gauge, Crosshair } from 'lucide-react'
import { analyzeRun, describeError } from '@/engine/coach'
import { GRADE_COLORS, GRADE_LABELS } from '@/engine/render'
import { GRADE_THRESHOLDS } from '@/engine/scoring'
import type { RunResult, WeaponDef } from '@/engine/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface ResultsPanelProps {
  result: RunResult | null
  weapon: WeaponDef
  best: RunResult | undefined
  sensitivity: number
  dpi: number
}

export function ResultsPanel({ result, weapon, best, sensitivity, dpi }: ResultsPanelProps) {
  if (!result) {
    return (
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle>Análisis</CardTitle>
          <CardDescription>Todavía no disparaste con esta configuración</CardDescription>
        </CardHeader>
        <CardContent className="px-4">
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-white/15 p-4 text-sm text-white/60">
            <Target className="size-5 shrink-0 text-fuchsia-300" />
            <p>
              Tener la mira en el punto perfecto en el instante de cada bala hace que pegue al centro: compensás el
              culatazo. Umbrales:{' '}
              <span style={{ color: GRADE_COLORS.perfect }}>Perfecto ≤ {GRADE_THRESHOLDS.perfect}°</span>,{' '}
              <span style={{ color: GRADE_COLORS.great }}>Genial ≤ {GRADE_THRESHOLDS.great}°</span>,{' '}
              <span style={{ color: GRADE_COLORS.good }}>Bien ≤ {GRADE_THRESHOLDS.good}°</span>.
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
  const maxErr = Math.max(1.2, ...result.shots.map((s) => s.errorDeg), 0.1)
  const isBest = best?.id === result.id
  const coach = analyzeRun(result, sensitivity, dpi)

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex flex-wrap items-center gap-2">
          Análisis
          {isBest && <Badge className="bg-fuchsia-500/20 text-fuchsia-200">Nuevo récord</Badge>}
          {!result.completed && (
            <Badge variant="outline" className="border-amber-400/40 text-amber-200">
              Ráfaga cortada
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {weapon.name} · {fired}/{result.bullets} · error medio {meanError.toFixed(2)}°
          {best && !isBest && ` · récord ${best.score.toLocaleString('es-AR')}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <Tabs defaultValue="coach">
          <TabsList className="w-full">
            <TabsTrigger value="coach">Coach</TabsTrigger>
            <TabsTrigger value="summary">Resumen</TabsTrigger>
            <TabsTrigger value="impacts">Impactos</TabsTrigger>
          </TabsList>

          <TabsContent value="coach" className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-1.5">
              <MiniStat
                icon={<Gauge className="size-3.5" />}
                label="Timing"
                value={
                  coach.meanSpeedRatio === null
                    ? '—'
                    : coach.meanSpeedRatio > 1.1
                      ? 'Muy rápido'
                      : coach.meanSpeedRatio < 0.9
                        ? 'Muy lento'
                        : 'OK'
                }
                sub={coach.meanSpeedRatio !== null ? `×${coach.meanSpeedRatio.toFixed(2)}` : undefined}
              />
              <MiniStat
                label="Pull-down"
                value={Math.abs(coach.pullBiasDeg) < 0.15 ? 'Clavado' : coach.pullBiasDeg > 0 ? 'Falta bajar' : 'De más'}
                sub={`${coach.pullBiasDeg >= 0 ? '+' : ''}${coach.pullBiasDeg.toFixed(2)}° · ${coach.pullBiasCm.toFixed(2)} cm`}
              />
              <MiniStat
                label="Horizontal"
                value={Math.abs(coach.meanDx) < 0.15 ? 'Centrado' : coach.meanDx > 0 ? '→ Derecha' : '← Izquierda'}
                sub={`${coach.meanDx >= 0 ? '+' : ''}${coach.meanDx.toFixed(2)}°`}
              />
            </div>

            <ul className="flex flex-col gap-1.5">
              {coach.tips.map((t, i) => (
                <li key={i} className="rounded-lg bg-white/[0.04] px-3 py-2 text-xs leading-snug text-white/80">
                  <span className="mr-1.5 font-bold text-fuchsia-300">{i + 1}.</span>
                  {t}
                </li>
              ))}
            </ul>

            {coach.segments.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] text-white/50">Por tramo del spray</div>
                <div className="flex flex-col gap-1">
                  {coach.segments.map((s) => (
                    <div key={`${s.from}-${s.to}`} className="flex items-start gap-2 text-[11px]">
                      <span className="w-14 shrink-0 font-mono text-white/50">
                        {s.from}–{s.to}
                      </span>
                      <span className="text-white/75">{s.tip}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="summary" className="flex flex-col gap-3">
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
                    return <div key={i} className="flex-1 rounded-sm bg-white/5" style={{ height: '6%' }} />
                  }
                  const h = Math.max(6, (s.errorDeg / maxErr) * 100)
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-sm"
                      style={{ height: `${h}%`, backgroundColor: GRADE_COLORS[s.grade] }}
                      title={`Bala ${i + 1}: ${s.errorDeg.toFixed(2)}° · ${GRADE_LABELS[s.grade]}${s.moving ? ' · en movimiento' : ''}`}
                    />
                  )
                })}
              </div>
            </div>

            {result.transfer && (
              <div className="rounded-lg bg-fuchsia-500/10 px-3 py-2 text-xs text-fuchsia-100">
                Spray transfer: {result.transfer.kills}/{result.transfer.targets} objetivos · impactos{' '}
                {result.transfer.hits.map((h, i) => `${i + 1}:${h}/4`).join(' · ')}
              </div>
            )}
            {result.strafe && (
              <div className="rounded-lg bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
                Strafe: {result.strafe.cleanWindows}/{result.strafe.windows} ventanas limpias · sync A/D{' '}
                {Math.round(result.strafe.holdSync * 100)}% · frenado medio{' '}
                {result.strafe.meanStopMs !== null ? `${Math.round(result.strafe.meanStopMs)} ms` : '—'} · counters{' '}
                {result.strafe.counterStrafes}
                {result.strafe.movingShots > 0 && ` · ${result.strafe.movingShots} balas en movimiento`}
              </div>
            )}
          </TabsContent>

          <TabsContent value="impacts" className="flex flex-col gap-3">
            <ImpactPlot result={result} />
            {coach.worst.length > 0 && coach.worst[0].errorDeg > GRADE_THRESHOLDS.perfect && (
              <div className="text-xs text-white/70">
                <span className="text-white/50">Peores balas: </span>
                {coach.worst.slice(0, 3).map((s, i) => (
                  <span key={s.index}>
                    {i > 0 && ', '}
                    bala {s.index + 1} ({s.errorDeg.toFixed(2)}°
                    {describeError(s.actual.x - s.target.x, s.actual.y - s.target.y)})
                  </span>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function MiniStat({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: string
  sub?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
      <div className="flex items-center gap-1 text-[11px] text-white/50">
        {icon}
        {label}
      </div>
      <div className="text-sm font-semibold text-white">{value}</div>
      {sub && <div className="text-[10px] text-white/40">{sub}</div>}
    </div>
  )
}

function ImpactPlot({ result }: { result: RunResult }) {
  const size = 180
  const scale = 28
  const cx = size / 2
  const cy = size / 2
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} className="rounded-lg bg-black/40 ring-1 ring-white/10">
        <line x1={cx} y1={0} x2={cx} y2={size} stroke="rgba(148,163,184,0.2)" />
        <line x1={0} y1={cy} x2={size} y2={cy} stroke="rgba(148,163,184,0.2)" />
        <circle cx={cx} cy={cy} r={0.3 * scale} fill="none" stroke="rgba(34,211,238,0.5)" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={0.6 * scale} fill="none" stroke="rgba(163,230,53,0.35)" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={1.0 * scale} fill="none" stroke="rgba(251,191,36,0.3)" strokeWidth={1} />
        {result.shots.map((s) => {
          const dx = s.impact.x - s.targetPos.x
          const dy = s.impact.y - s.targetPos.y
          return (
            <circle
              key={s.index}
              cx={cx + dx * scale}
              cy={cy - dy * scale}
              r={3}
              fill={GRADE_COLORS[s.grade]}
              opacity={0.9}
            >
              <title>{`Bala ${s.index + 1}: (${dx.toFixed(2)}, ${dy.toFixed(2)})°`}</title>
            </circle>
          )
        })}
        <Crosshair className="hidden" />
        <text x={8} y={size - 8} fill="rgba(148,163,184,0.6)" fontSize={10}>
          centro = pecho
        </text>
      </svg>
      <p className="text-[11px] text-white/50">Cada punto es dónde pegó la bala respecto al objetivo (0,0).</p>
    </div>
  )
}
