import type { RaceResultEntry } from '../../types'
import { MEDAL } from './utils'

function PositionChange({ gained }: { gained: number | null }) {
  if (gained === null || gained === 0) return <span className="text-text-tertiary">—</span>
  if (gained > 0) return <span className="text-green-400">▲{gained}</span>
  return <span className="text-red-400">▼{Math.abs(gained)}</span>
}

export function RaceTable({ results, onSelectDriver, selectedA, selectedB }: {
  results: RaceResultEntry[]
  onSelectDriver?: (abbreviation: string) => void
  selectedA?: string | null
  selectedB?: string | null
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] text-text-tertiary tracking-wider border-b border-border">
            <th className="text-left py-2 px-2 w-10">POS</th>
            <th className="text-left py-2 px-2">DRIVER</th>
            <th className="text-left py-2 px-2 hidden sm:table-cell">TEAM</th>
            <th className="text-right py-2 px-2 hidden md:table-cell">GRID</th>
            <th className="text-center py-2 px-2 hidden md:table-cell">+/-</th>
            <th className="text-right py-2 px-2 hidden sm:table-cell">LAPS</th>
            <th className="text-right py-2 px-2">TIME / STATUS</th>
            <th className="text-right py-2 px-2 hidden lg:table-cell">FASTEST</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const isPodium = r.position <= 3
            const dnf = r.status && r.status !== 'Finished' && !r.status.startsWith('+')
            const isFastestLap = r.fastest_lap_rank === '1'
            const isSelA = r.abbreviation === selectedA
            const isSelB = r.abbreviation === selectedB
            return (
              <tr
                key={r.position}
                onClick={() => onSelectDriver?.(r.abbreviation)}
                className={`border-b border-border/50 transition-colors ${onSelectDriver ? 'cursor-pointer' : ''} ${isSelA || isSelB ? 'bg-bg-elevated' : 'hover:bg-bg-elevated/50'} ${dnf ? 'opacity-60' : ''}`}
              >
                <td className="py-2.5 px-2 font-mono">
                  {isPodium ? <span className="text-base">{MEDAL[r.position - 1]}</span> : <span className="text-text-secondary">{r.position}</span>}
                </td>
                <td className="py-2.5 px-2">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: r.team_color }} />
                    <div>
                      <span className="font-medium">{r.driver}</span>
                      <span className="text-text-tertiary text-xs ml-1.5 sm:hidden">{r.team}</span>
                    </div>
                    {isSelA && <span className="text-[8px] font-mono bg-accent/20 text-accent px-1 py-0.5 rounded ml-1">A</span>}
                    {isSelB && <span className="text-[8px] font-mono bg-white/10 text-white px-1 py-0.5 rounded ml-1">B</span>}
                  </div>
                </td>
                <td className="py-2.5 px-2 text-text-secondary text-xs hidden sm:table-cell">{r.team}</td>
                <td className="py-2.5 px-2 text-right font-mono text-text-secondary hidden md:table-cell">{r.grid || '—'}</td>
                <td className="py-2.5 px-2 text-center text-xs font-mono hidden md:table-cell"><PositionChange gained={r.positions_gained} /></td>
                <td className="py-2.5 px-2 text-right font-mono text-text-secondary hidden sm:table-cell">{r.laps || '—'}</td>
                <td className="py-2.5 px-2 text-right font-mono text-xs">
                  {dnf ? <span className="text-red-400">{r.status}</span>
                    : r.position === 1 ? <span className="text-text-primary">{r.time}</span>
                    : <span className="text-text-secondary">{r.gap || r.status}</span>}
                </td>
                <td className="py-2.5 px-2 text-right font-mono text-xs hidden lg:table-cell">
                  {r.fastest_lap_time ? (
                    <span className={isFastestLap ? 'text-purple-400' : 'text-text-tertiary'}>
                      {r.fastest_lap_time}{isFastestLap && ' ⚡'}
                    </span>
                  ) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
