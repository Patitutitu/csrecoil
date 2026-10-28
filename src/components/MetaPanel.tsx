import { Flame, Share2, Sparkles, Trophy } from 'lucide-react'
import { WEAPON_BY_ID } from '@/data/weapons'
import { practiceRating, ratingTier, streakDays } from '@/engine/rating'
import type { GameId, RunResult } from '@/engine/types'
import { dailyChallenge } from '@/lib/daily'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface MetaPanelProps {
  history: RunResult[]
  onPlayDaily: () => void
  onWarmup: () => void
  onShare: () => void
  dailyDone: boolean
}

export function MetaPanel({ history, onPlayDaily, onWarmup, onShare, dailyDone }: MetaPanelProps) {
  const rating = practiceRating(history)
  const tier = ratingTier(rating)
  const streak = streakDays(history)
  const daily = dailyChallenge()
  const weapon = WEAPON_BY_ID[daily.weaponId]

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="size-4 text-amber-300" />
          CS Practice Rating
        </CardTitle>
        <CardDescription>Subí practicando todos los días antes de rankear</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex items-end gap-3">
          <div className="text-4xl font-black tabular-nums" style={{ color: tier.color }}>
            {rating}
          </div>
          <div className="pb-1">
            <div className="text-sm font-semibold" style={{ color: tier.color }}>
              {tier.label}
            </div>
            <div className="flex items-center gap-1 text-xs text-white/50">
              <Flame className={`size-3.5 ${streak > 0 ? 'text-orange-400' : 'text-white/30'}`} />
              {streak > 0 ? `${streak} día${streak === 1 ? '' : 's'} seguidos` : 'Sin racha todavía'}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-white/80">{daily.label}</span>
            {dailyDone && <span className="text-lime-300">Hecho ✓</span>}
          </div>
          <p className="text-[11px] text-white/50">
            {weapon?.name} · {gameLabel(daily.game)} · {daily.mode} · {daily.guide}
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="flex-1" onClick={onPlayDaily}>
              Jugar desafío
            </Button>
            <Button size="sm" variant="outline" onClick={onShare} title="Copiar link del desafío">
              <Share2 className="size-3.5" />
            </Button>
          </div>
        </div>

        <Button variant="secondary" size="sm" onClick={onWarmup}>
          <Sparkles data-icon="inline-start" />
          Calentamiento 60 s (AK 4 → M4 9 → transfer)
        </Button>
      </CardContent>
    </Card>
  )
}

function gameLabel(g: GameId): string {
  return g === 'recoil' ? 'Spray' : g === 'transfer' ? 'Transfer' : 'Strafe'
}
