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
            <div className="relative flex-1 h-4 bg-bg-elevated rounded overflow-hidden">
              {driver.stints.map((stint, i) => {
                const start = stint.lap_start ?? 1
                const end = stint.lap_end ?? start
                const left = ((start - 1) / maxLap) * 100
                const width = Math.max(((end - start + 1) / maxLap) * 100, 0.5)
                return (
                  <div
                    key={i}
                    className="absolute top-0 h-full flex items-center justify-center"
                    style={{ left: `${left}%`, width: `${width}%`, backgroundColor: stint.compound_color }}
                    title={`${stint.compound || 'Unknown'} — laps ${start}–${end}`}
                  >
                    {width > 4 && <span className="text-[8px] font-bold text-black/70">{stint.compound_short}</span>}
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
