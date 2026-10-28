import { WEAPONS } from '@/data/weapons'
import type { GameId, GuideLevel, RecoilMode, StrafeMode, TransferMode } from '@/engine/types'
import { mulberry32, seedFromString } from './random'

export function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

export interface DailyChallenge {
  day: string
  seed: number
  game: GameId
  weaponId: string
  mode: RecoilMode | TransferMode | StrafeMode
  guide: GuideLevel
  label: string
}

const GAMES: GameId[] = ['recoil', 'transfer', 'strafe']
const RECOIL: RecoilMode[] = ['first4', 'first9', 'full']
const TRANSFER: TransferMode[] = ['t2', 't3', 't5']
const STRAFE: StrafeMode[] = ['tap', 'burst']
const GUIDES: GuideLevel[] = ['guided', 'fade', 'blind']

export function dailyChallenge(day = utcDayKey()): DailyChallenge {
  const seed = seedFromString(`recoil-rhythm-daily:${day}`)
  const rnd = mulberry32(seed)
  const game = GAMES[Math.floor(rnd() * GAMES.length)]
  const weapon = WEAPONS[Math.floor(rnd() * WEAPONS.length)]
  let mode: RecoilMode | TransferMode | StrafeMode
  let guide: GuideLevel
  if (game === 'recoil') {
    mode = RECOIL[Math.floor(rnd() * RECOIL.length)]
    guide = GUIDES[Math.floor(rnd() * GUIDES.length)]
  } else if (game === 'transfer') {
    mode = TRANSFER[Math.floor(rnd() * TRANSFER.length)]
    guide = GUIDES[Math.floor(rnd() * 2)]
  } else {
    mode = STRAFE[Math.floor(rnd() * STRAFE.length)]
    guide = 'guided'
  }
  const gameLabel = game === 'recoil' ? 'Spray' : game === 'transfer' ? 'Transfer' : 'Strafe'
  return {
    day,
    seed,
    game,
    weaponId: weapon.id,
    mode,
    guide,
    label: `Desafío ${day}: ${weapon.short} · ${gameLabel}`,
  }
}
