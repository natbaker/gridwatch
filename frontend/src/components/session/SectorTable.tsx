import type { LiveTimingEntry, BestSectors } from '../../types'
import { formatLapTime } from './utils'

interface Props {
  drivers: LiveTimingEntry[]
  bestSectors: BestSectors
}

const EPS = 0.0005

// Per-driver best sector times. A time matching the session best is highlighted
// purple (the F1 convention for an overall fastest sector).
export function SectorTable({ drivers, bestSectors }: Props) {
  const withSectors = drivers.filter(
    d => d.best_sector_1 != null || d.best_sector_2 != null || d.best_sector_3 != null,
  )
  if (withSectors.length === 0) return null

  const isBest = (val: number | null, best: number | null) =>
    val != null && best != null && Math.abs(val - best) < EPS

  const cell = (val: number | null, best: number | null) => (
    <td className={`px-2 py-1 text-right font-mono tabular-nums ${isBest(val, best) ? 'text-purple-400 font-semibold' : 'text-text-secondary'}`}>
      {formatLapTime(val)}
    </td>
  )

  return (
    <div className="bg-bg-card border border-border rounded-xl p-3 sm:p-4">
      <h3 className="text-xs tracking-[2px] text-text-secondary mb-3">BEST SECTORS</h3>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-text-tertiary text-[9px] uppercase tracking-wider">
            <th className="px-2 py-1 text-left">Driver</th>
            <th className="px-2 py-1 text-right">S1</th>
            <th className="px-2 py-1 text-right">S2</th>
            <th className="px-2 py-1 text-right">S3</th>
          </tr>
        </thead>
        <tbody>
          {withSectors.map(d => (
            <tr key={d.driver_number} className="border-t border-border/40">
              <td className="px-2 py-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-1 h-3 rounded-sm" style={{ backgroundColor: d.team_color }} />
                  <span className="font-mono">{d.abbreviation}</span>
                </div>
              </td>
              {cell(d.best_sector_1, bestSectors.sector_1)}
              {cell(d.best_sector_2, bestSectors.sector_2)}
              {cell(d.best_sector_3, bestSectors.sector_3)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
