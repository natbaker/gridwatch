import type { RaceControlEvent } from '../../hooks/useReplay'
import { FLAG_STYLES } from './utils'

export function FlagBanner({ event }: { event: RaceControlEvent }) {
  const key = event.category === 'SafetyCar' ? 'SafetyCar' : (event.flag ?? '')
  const style = FLAG_STYLES[key]
  if (!style) return null
  return (
    <div className={`${style.bg} border border-current/20 rounded-lg px-3 py-1.5 flex items-center gap-2 ${style.text}`}>
      <span className="text-[10px] font-mono font-bold tracking-wider">{style.label}</span>
      <span className="text-[10px] opacity-80 truncate">{event.message}</span>
    </div>
  )
}
