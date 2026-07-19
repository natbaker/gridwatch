import { Link } from 'react-router-dom'
import { useNextSession } from '../../hooks/useNextSession'
import { useQualifyingResults } from '../../hooks/useQualifyingResults'

const MEDAL = ['\u{1F947}', '\u{1F948}', '\u{1F949}']
const PODIUM_BG = [
  'bg-gradient-to-r from-yellow-500/10 to-transparent',
  'bg-gradient-to-r from-gray-400/10 to-transparent',
  'bg-gradient-to-r from-amber-700/10 to-transparent',
]

export function QualifyingResult() {
  const { data: nextSession } = useNextSession()
  const round = nextSession?.race?.round ?? 0
  const raceDate = nextSession?.race?.race_date
  const qualDone = !!nextSession?.weekend_sessions?.some(
    (s) => s.short_name === 'QUAL' && s.status === 'completed'
  )

  const { data } = useQualifyingResults(qualDone ? round : 0, raceDate)

  if (!qualDone || !data?.qualifying?.length) return null

  const podium = data.qualifying.slice(0, 3)
  const linkParams = new URLSearchParams({ tab: 'qualifying' })
  if (raceDate) linkParams.set('race_date', raceDate)

  return (
    <div className="bg-bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs text-text-secondary tracking-[2px]">QUALIFYING</h3>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-text-tertiary">{data.race_name}</span>
          <Link
            to={`/race/${round}?${linkParams.toString()}`}
            className="text-[10px] text-accent hover:underline"
          >
            FULL RESULTS →
          </Link>
        </div>
      </div>
      <div className="space-y-2">
        {podium.map((entry, i) => (
          <div
            key={entry.position}
            className={`flex items-center gap-3 py-2 px-3 rounded-lg ${PODIUM_BG[i]}`}
          >
            <span className="text-lg">{MEDAL[i]}</span>
            <div
              className="w-1 h-8 rounded-full"
              style={{ backgroundColor: entry.team_color }}
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">{entry.driver}</span>
              <p className="text-[11px] text-text-tertiary truncate">{entry.team}</p>
            </div>
            <span className="text-xs font-mono text-text-secondary">{entry.q3 || ''}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
