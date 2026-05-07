import { formatGap } from './utils'

export interface MiniStandingRow {
  driver_number: number
  abbreviation: string
  team_color: string
  position: number | null
  interval: number | null
}

export function MiniStandings({ rows, followedDriver, compareDriver, onClickDriver }: {
  rows: MiniStandingRow[]
  followedDriver?: number | null
  compareDriver?: number | null
  onClickDriver?: (n: number) => void
}) {
  return (
    <div className="w-48 flex-shrink-0 overflow-y-auto pr-1">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] text-text-tertiary tracking-wider">
            <th className="text-left py-1 px-1 w-6">P</th>
            <th className="text-left py-1 px-1">DRIVER</th>
            <th className="text-right py-1 px-1">INT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => {
            const isFollowed = followedDriver === d.driver_number
            const isCompare = compareDriver === d.driver_number
            return (
              <tr
                key={d.driver_number}
                className={`border-b border-border/20 ${onClickDriver ? 'cursor-pointer hover:bg-bg-elevated/50' : ''} ${isFollowed ? 'bg-accent/10' : isCompare ? 'bg-bg-elevated' : ''}`}
                onClick={() => onClickDriver?.(d.driver_number)}
              >
                <td className="py-[3px] px-1 font-mono font-bold text-text-secondary">{d.position || '—'}</td>
                <td className="py-[3px] px-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-0.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.team_color }} />
                    <span className="font-mono font-semibold">{d.abbreviation}</span>
                  </div>
                </td>
                <td className="py-[3px] px-1 text-right font-mono">
                  {isFollowed ? (
                    <span className="text-[8px] text-accent font-bold tracking-wider">A</span>
                  ) : isCompare ? (
                    <span className="text-[8px] text-text-secondary font-bold tracking-wider">B</span>
                  ) : (
                    <span className="text-text-tertiary">{d.position === 1 ? 'LDR' : formatGap(d.interval)}</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
