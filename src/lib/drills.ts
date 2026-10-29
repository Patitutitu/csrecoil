import { Eye, EyeOff, Sparkles, Crosshair, ArrowLeftRight, Keyboard } from 'lucide-react'
import type { GameId, GuideLevel, RecoilMode, StrafeMode, TransferMode } from '@/engine/types'

export const GAMES: {
  id: GameId
  label: string
  hint: string
  icon: typeof Crosshair
}[] = [
  {
    id: 'recoil',
    label: 'Spray',
    hint: 'Compensá el pattern hasta (0,0): cada bala al centro',
    icon: Crosshair,
  },
  {
    id: 'transfer',
    label: 'Transfer',
    hint: '4 balas al pecho por objetivo, después mové en X sin perder altura',
    icon: ArrowLeftRight,
  },
  {
    id: 'strafe',
    label: 'Strafe',
    hint: 'A← mira →D: counter y spray en el centro como en CS2',
    icon: Keyboard,
  },
]

export const RECOIL_MODES: { id: RecoilMode; label: string; key: string; hint: string }[] = [
  { id: 'first4', label: '4 balas', key: 'Q', hint: 'El tap controlado: casi todo es pull-down' },
  { id: 'first9', label: '9 balas', key: 'W', hint: 'La ráfaga que define la mayoría de los duelos' },
  { id: 'full', label: 'Cargador', key: 'E', hint: 'El patrón completo, con todos los quiebres laterales' },
  { id: 'custom', label: 'Custom', key: 'C', hint: 'Elegí cuántas balas practicar (1 hasta el cargador)' },
]

export const TRANSFER_MODES: { id: TransferMode; label: string; key: string; hint: string }[] = [
  { id: 't2', label: '2 objetivos', key: 'Q', hint: '8 balas: 4 + 4, transfer corto' },
  { id: 't3', label: '3 objetivos', key: 'W', hint: '12 balas en línea a y = 0' },
  { id: 't5', label: '5 objetivos', key: 'E', hint: '20 balas: el spray transfer completo' },
]

export const STRAFE_MODES: { id: StrafeMode; label: string; key: string; hint: string }[] = [
  { id: 'tap', label: 'Tap', key: 'Q', hint: 'Strafe → counter (~80 ms) → 1 bala quieto · sin counter no dispara' },
  { id: 'burst', label: 'Burst', key: 'W', hint: 'Strafe → counter → N balas quieto (elegís cuántas) · sin counter no dispara' },
]

/** @deprecated usar RECOIL_MODES; se mantiene para compat de imports viejos */
export const MODES = RECOIL_MODES

export const GUIDES: { id: GuideLevel; label: string; hint: string; icon: typeof Eye }[] = [
  { id: 'guided', label: 'Guiado', hint: 'Camino y láser visibles toda la ráfaga', icon: Eye },
  { id: 'fade', label: 'Fade', hint: 'La guía se apaga tras las primeras balas', icon: Sparkles },
  { id: 'blind', label: 'Ciego', hint: 'Solo el metrónomo; el patrón se revela al final', icon: EyeOff },
]

export function modesForGame(game: GameId) {
  if (game === 'transfer') return TRANSFER_MODES
  if (game === 'strafe') return STRAFE_MODES
  return RECOIL_MODES
}

export function defaultMode(game: GameId): RecoilMode | TransferMode | StrafeMode {
  return modesForGame(game)[0].id
}
