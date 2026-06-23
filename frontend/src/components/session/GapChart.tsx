import { useMemo } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts'
import { buildGapSeries, type IntervalEvent, type LapEvent } from './gapSeries'

interface Props {
  intervalEvents: IntervalEvent[]
  drivers: Record<string, { abbreviation: string; team_color: string }>
  lapEvents: LapEvent[]
}

// Gap-to-leader by lap, one line per driver. Lower is closer to the front.
export function GapChart({ intervalEvents, drivers, lapEvents }: Props) {
  const { data, keys } = useMemo(
    () => buildGapSeries(intervalEvents, drivers, lapEvents),
    [intervalEvents, drivers, lapEvents],
  )

  if (data.length === 0) return null

  return (
    <div className="bg-bg-card border border-border rounded-xl p-3 sm:p-4">
      <h3 className="text-xs tracking-[2px] text-text-secondary mb-3">GAP TO LEADER</h3>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
          <XAxis
            dataKey="lap"
            tick={{ fontSize: 9, fill: '#888' }}
            stroke="#444"
            tickFormatter={(v: number) => `L${v}`}
          />
          <YAxis
            reversed
            tick={{ fontSize: 9, fill: '#888' }}
            stroke="#444"
            width={40}
            tickFormatter={(v: number) => `+${v}s`}
          />
          <Tooltip
            contentStyle={{ background: '#1a1a1a', border: '1px solid #333', fontSize: 11 }}
            labelFormatter={(label) => `Lap ${label}`}
            formatter={(value, name) => [`+${Number(value).toFixed(1)}s`, String(name)]}
          />
          {keys.map(k => (
            <Line
              key={k.n}
              type="monotone"
              dataKey={k.abbreviation}
              stroke={k.color}
              dot={false}
              strokeWidth={1.5}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
