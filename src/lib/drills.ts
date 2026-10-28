import { Eye, EyeOff, Sparkles } from 'lucide-react'
import type { DrillMode, GuideLevel } from '@/engine/types'

export const MODES: { id: DrillMode; label: string; key: string; hint: string }[] = [
  { id: 'first4', label: '4 balas', key: 'Q', hint: 'El tap controlado: casi todo es pull-down' },
  { id: 'first9', label: '9 balas', key: 'W', hint: 'La ráfaga que define la mayoría de los duelos' },
  { id: 'full', label: 'Cargador', key: 'E', hint: 'El patrón completo, con todos los quiebres laterales' },
]

export const GUIDES: { id: GuideLevel; label: string; hint: string; icon: typeof Eye }[] = [
  { id: 'guided', label: 'Guiado', hint: 'Camino y láser visibles toda la ráfaga', icon: Eye },
  { id: 'fade', label: 'Fade', hint: 'La guía se apaga tras las primeras balas', icon: Sparkles },
  { id: 'blind', label: 'Ciego', hint: 'Solo el metrónomo; el patrón se revela al final', icon: EyeOff },
]
