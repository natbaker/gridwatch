import type { LiveTimingEntry } from '../../types'
import { pitWindowEstimate } from './pitWindowModel'

interface Props {
  drivers: LiveTimingEntry[]
}

// Pit-window tracker: estimates how many laps of tire life remain for each
// driver's current stint, surfacing who is due to pit soonest.
export function PitWindow({ drivers }: Props) {
  const rows = drivers
    .filter(d => d.tire_compound)
    .map(d => ({ driver: d, est: pitWindowEstimate(d.tire_compound, d.tire_age) }))
    .sort((a, b) => a.est.remaining - b.est.remaining)

  if (rows.length === 0) return null

  return (
    <div className="bg-bg-card border border-border rounded-xl p-3 sm:p-4">
      <h3 className="text-xs tracking-[2px] text-text-secondary mb-3">PIT WINDOW</h3>
      <div className="space-y-1.5">
        {rows.map(({ driver, est }) => {
          const due = est.remaining <= 3
          return (
            <div key={driver.driver_number} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 w-12 shrink-0">
                <div className="w-1 h-3.5 rounded-sm" style={{ backgroundColor: driver.team_color }} />
                <span className="text-[10px] font-mono text-text-secondary">{driver.abbreviation}</span>
              </div>
              <span
                className="text-[9px] font-bold w-4 text-center rounded-sm"
                style={{ color: driver.tire_compound_color }}
                title={driver.tire_compound}
              >
                {driver.tire_compound_short}
              </span>
              <div className="relative flex-1 h-3 bg-bg-elevated rounded overflow-hidden">
                <div
                  className={`h-full ${due ? 'bg-red-500/70' : 'bg-accent/60'}`}
                  style={{ width: `${Math.round(est.pct * 100)}%` }}
                />
              </div>
              <span className={`text-[10px] font-mono tabular-nums w-16 text-right ${due ? 'text-red-400' : 'text-text-tertiary'}`}>
                {driver.tire_age}/{est.maxLaps} (~{est.remaining})
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
