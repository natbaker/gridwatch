import type { DriverStrategy } from '../../types'

interface Props {
  strategy: DriverStrategy[]
  totalLaps: number
}

// Horizontal tire-strategy bars: one row per driver, each stint a coloured
// segment sized by its lap range.
export function StrategyChart({ strategy, totalLaps }: Props) {
  const maxLap = Math.max(
    totalLaps,
    ...strategy.flatMap(d => d.stints.map(s => s.lap_end ?? 0)),
    1,
  )

  if (strategy.length === 0) return null

  return (
    <div className="bg-bg-card border border-border rounded-xl p-3 sm:p-4">
      <h3 className="text-xs tracking-[2px] text-text-secondary mb-3">TIRE STRATEGY</h3>
      <div className="space-y-1.5">
        {strategy.map(driver => (
          <div key={driver.driver_number} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 w-12 shrink-0">
              <div className="w-1 h-3.5 rounded-sm" style={{ backgroundColor: driver.team_color }} />
              <span className="text-[10px] font-mono text-text-secondary">{driver.abbreviation}</span>
            </div>
            <div className="relative flex-1 h-4 bg-bg-elevated rounded overflow-hidden flex">
              {driver.stints.map((stint, i) => {
                const start = stint.lap_start ?? 0
                const end = stint.lap_end ?? start
                const width = Math.max(((end - start + 1) / maxLap) * 100, 1)
                return (
                  <div
                    key={i}
                    className="h-full flex items-center justify-center border-r border-bg-card/50 last:border-r-0"
                    style={{ width: `${width}%`, backgroundColor: stint.compound_color }}
                    title={`${stint.compound || 'Unknown'} — laps ${start}–${end}`}
                  >
                    <span className="text-[8px] font-bold text-black/70">{stint.compound_short}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
