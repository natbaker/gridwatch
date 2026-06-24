import { Link } from 'react-router-dom'
import type { Race } from '../../types'

const raceNavUrl = (r: Race) => `/race/${r.round}?race_date=${r.race_date.slice(0, 10)}`
const shortName = (name: string) => name.replace(' Grand Prix', ' GP')

export function RaceNav({ prevRace, nextRace }: { prevRace: Race | null; nextRace: Race | null }) {
  if (!prevRace && !nextRace) return null
  return (
    <div className="flex items-center gap-1">
      {prevRace ? (
        <Link
          to={raceNavUrl(prevRace)}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono text-text-tertiary hover:text-text-primary bg-bg-card border border-border rounded-lg transition-colors"
        >
          ← {shortName(prevRace.name)}
        </Link>
      ) : <div />}
      {nextRace && (
        <Link
          to={raceNavUrl(nextRace)}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono text-text-tertiary hover:text-text-primary bg-bg-card border border-border rounded-lg transition-colors"
        >
          {shortName(nextRace.name)} →
        </Link>
      )}
    </div>
  )
}
