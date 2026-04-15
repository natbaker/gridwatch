import { SeasonCalendar } from '../components/calendar/SeasonCalendar'
import { useSeason } from '../hooks/useSeason'

export function CalendarPage() {
  const { season } = useSeason()
  return (
    <div className="max-w-[1280px] mx-auto px-5 py-6">
      <h2 className="text-xs text-text-secondary tracking-[2px] mb-6">{season} SEASON CALENDAR</h2>
      <SeasonCalendar />
    </div>
  )
}
