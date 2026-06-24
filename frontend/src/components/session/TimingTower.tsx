import { useEffect, useRef, useState } from 'react'
import type { LiveTimingEntry } from '../../types'
import { formatLapTime, formatGap } from './utils'
import { TireChip } from './TireChip'

type Flash = 'up' | 'down'

export function TimingTower({ drivers }: { drivers: LiveTimingEntry[] }) {
  const prevPos = useRef<Map<number, number>>(new Map())
  const [flashes, setFlashes] = useState<Record<number, Flash>>({})

  useEffect(() => {
    const changed: Record<number, Flash> = {}
    for (const d of drivers) {
      if (!d.position) continue
      const before = prevPos.current.get(d.driver_number)
      if (before != null && before !== d.position) {
        changed[d.driver_number] = d.position < before ? 'up' : 'down'
      }
      prevPos.current.set(d.driver_number, d.position)
    }
    if (Object.keys(changed).length === 0) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFlashes((f) => ({ ...f, ...changed }))
    const timer = setTimeout(() => {
      setFlashes((f) => {
        const next = { ...f }
        for (const n of Object.keys(changed)) delete next[Number(n)]
        return next
      })
    }, 1000)
    return () => clearTimeout(timer)
  }, [drivers])

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="text-[10px] text-text-tertiary tracking-wider border-b border-border">
            <th className="text-left py-2 px-2 w-10">P</th>
            <th className="text-left py-2 px-2">DRIVER</th>
            <th className="text-right py-2 px-2">GAP</th>
            <th className="text-right py-2 px-2">INT</th>
            <th className="text-right py-2 px-2">LAST LAP</th>
            <th className="text-right py-2 px-2">BEST</th>
            <th className="text-center py-2 px-2">S1</th>
            <th className="text-center py-2 px-2">S2</th>
            <th className="text-center py-2 px-2">S3</th>
            <th className="text-center py-2 px-2">TIRE</th>
            <th className="text-center py-2 px-2">PIT</th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => {
            const flash = flashes[d.driver_number]
            return (
            <tr key={d.driver_number} className={`border-b border-border/30 transition-colors duration-700 ${
              flash === 'up' ? 'bg-green-500/15' : flash === 'down' ? 'bg-red-500/15' : 'hover:bg-bg-elevated/50'
            }`}>
              <td className="py-2 px-2 font-mono font-bold text-text-secondary">{d.position || '—'}</td>
              <td className="py-2 px-2">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: d.team_color }} />
                  <div>
                    <span className="font-mono font-semibold text-xs">{d.abbreviation}</span>
                    <span className="text-text-tertiary text-[10px] ml-1.5">{d.team}</span>
                  </div>
                </div>
              </td>
              <td className="py-2 px-2 text-right font-mono text-xs text-text-secondary">
                {d.position === 1 ? <span className="text-text-primary">LEADER</span> : formatGap(d.gap_to_leader)}
              </td>
              <td className="py-2 px-2 text-right font-mono text-xs text-text-secondary">
                {d.position === 1 ? '—' : formatGap(d.interval)}
              </td>
              <td className={`py-2 px-2 text-right font-mono text-xs ${
                d.is_session_best ? 'text-purple-400 font-semibold' :
                d.is_personal_best ? 'text-green-400' : 'text-text-secondary'
              }`}>
                {formatLapTime(d.last_lap)}
              </td>
              <td className="py-2 px-2 text-right font-mono text-xs text-text-tertiary">
                {formatLapTime(d.best_lap)}
              </td>
              <td className="py-2 px-2 text-center font-mono text-[11px] text-text-tertiary">
                {d.sector_1 ? d.sector_1.toFixed(1) : '—'}
              </td>
              <td className="py-2 px-2 text-center font-mono text-[11px] text-text-tertiary">
                {d.sector_2 ? d.sector_2.toFixed(1) : '—'}
              </td>
              <td className="py-2 px-2 text-center font-mono text-[11px] text-text-tertiary">
                {d.sector_3 ? d.sector_3.toFixed(1) : '—'}
              </td>
              <td className="py-2 px-2">
                <div className="flex justify-center">
                  {d.tire_compound ? <TireChip compound={d.tire_compound} color={d.tire_compound_color} age={d.tire_age} /> : '—'}
                </div>
              </td>
              <td className="py-2 px-2 text-center font-mono text-xs text-text-tertiary">
                {d.pit_count || '—'}
              </td>
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
