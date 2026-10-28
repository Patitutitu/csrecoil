import { Trash2 } from 'lucide-react'
import { WEAPON_BY_ID } from '@/data/weapons'
import type { DrillMode, GuideLevel, RunResult } from '@/engine/types'
import { bulletStats } from '@/store/storage'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface StatsPanelProps {
  history: RunResult[]
  weaponId: string
  mode: DrillMode
  guide: GuideLevel
  onClear: () => void
}

const MODE_SHORT: Record<DrillMode, string> = { first4: '4', first9: '9', full: 'Full' }
const GUIDE_SHORT: Record<GuideLevel, string> = { guided: 'Guiado', fade: 'Fade', blind: 'Ciego' }

const GRADE_TEXT: Record<RunResult['grade'], string> = {
  S: 'text-cyan-300',
  A: 'text-lime-300',
  B: 'text-amber-300',
  C: 'text-orange-300',
  D: 'text-rose-300',
}

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(ts)
}

export function StatsPanel({ history, weaponId, mode, guide, onClear }: StatsPanelProps) {
  const recent = history.slice(0, 12)
  const perBullet = bulletStats(history, weaponId, mode)
  const sameSetup = history.filter((r) => r.weaponId === weaponId && r.mode === mode && r.guide === guide)
  const avgAcc = sameSetup.length ? sameSetup.reduce((a, r) => a + r.accuracy, 0) / sameSetup.length : 0
  const maxErr = Math.max(0.6, ...perBullet.map((b) => b.meanError))

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle>Progreso</CardTitle>
        <CardDescription>
          {sameSetup.length
            ? `${sameSetup.length} ráfagas con esta configuración · precisión media ${Math.round(avgAcc * 100)}%`
            : 'Se guarda en este navegador'}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <Tabs defaultValue="history">
          <TabsList className="w-full">
            <TabsTrigger value="history">Historial</TabsTrigger>
            <TabsTrigger value="bullets">Por bala</TabsTrigger>
          </TabsList>
          <TabsContent value="history">
            {recent.length === 0 ? (
              <p className="rounded-lg border border-dashed border-white/15 p-3 text-xs text-white/50">
                Tus últimas ráfagas van a aparecer acá con puntaje y nota.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-white/5 text-xs">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 py-1.5">
                    <span className={`w-4 text-base font-black ${GRADE_TEXT[r.grade]}`}>{r.grade}</span>
                    <span className="flex-1 truncate text-white/80">
                      {WEAPON_BY_ID[r.weaponId]?.short ?? r.weaponId} · {MODE_SHORT[r.mode]} · {GUIDE_SHORT[r.guide]}
                      {!r.completed && <span className="text-amber-300/80"> · cortada</span>}
                    </span>
                    <span className="tabular-nums text-white/60">{Math.round(r.accuracy * 100)}%</span>
                    <span className="w-14 text-right font-semibold tabular-nums text-white">{r.score.toLocaleString('es-AR')}</span>
                    <span className="hidden w-20 text-right text-white/40 sm:inline">{formatDate(r.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="bullets">
            {perBullet.length === 0 ? (
              <p className="rounded-lg border border-dashed border-white/15 p-3 text-xs text-white/50">
                Error medio por número de bala para {WEAPON_BY_ID[weaponId]?.name} en modo {MODE_SHORT[mode]}: muestra en
                qué tramo del spray se te rompe el control.
              </p>
            ) : (
              <div>
                <div className="flex h-20 items-end gap-[2px]">
                  {perBullet.map((b) => {
                    const h = Math.max(6, (b.meanError / maxErr) * 100)
                    const color = b.meanError <= 0.3 ? '#22d3ee' : b.meanError <= 0.6 ? '#a3e635' : b.meanError <= 1 ? '#fbbf24' : '#fb7185'
                    return (
                      <div
                        key={b.index}
                        className="flex-1 rounded-sm"
                        style={{ height: `${h}%`, backgroundColor: color }}
                        title={`Bala ${b.index + 1}: ${b.meanError.toFixed(2)}° promedio en ${b.samples} ráfagas`}
                      />
                    )
                  })}
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-white/40">
                  <span>bala 1</span>
                  <span>{maxErr.toFixed(1)}° máx. · bala {perBullet[perBullet.length - 1].index + 1}</span>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
        {history.length > 0 && (
          <Button variant="ghost" size="xs" className="mt-2 text-white/50" onClick={onClear}>
            <Trash2 data-icon="inline-start" />
            Borrar historial
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
