import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts'
import type { LapTelemetryResponse } from '../../types'

interface TelemetryChartProps {
  driverA: { data: LapTelemetryResponse; color: string; abbreviation: string } | null
  driverB: { data: LapTelemetryResponse; color: string; abbreviation: string } | null
}

interface ChartRow {
  distance: number
  speedA?: number
  speedB?: number
  thrA?: number
  thrB?: number
  brkA?: number
  brkB?: number
}

function mergeChannels(
  a: LapTelemetryResponse | null,
  b: LapTelemetryResponse | null,
): ChartRow[] {
  const map = new Map<number, ChartRow>()

  if (a) {
    for (let i = 0; i < a.channels.distance_pct.length; i++) {
      const d = a.channels.distance_pct[i]
      const row = map.get(d) ?? { distance: d }
      row.speedA = a.channels.speed[i]
      row.thrA = a.channels.throttle[i]
      row.brkA = a.channels.brake[i]
      map.set(d, row)
    }
  }

  if (b) {
    for (let i = 0; i < b.channels.distance_pct.length; i++) {
      const d = b.channels.distance_pct[i]
      const row = map.get(d) ?? { distance: d }
      row.speedB = b.channels.speed[i]
      row.thrB = b.channels.throttle[i]
      row.brkB = b.channels.brake[i]
      map.set(d, row)
    }
  }

  return Array.from(map.values()).sort((a, b) => a.distance - b.distance)
}

const SYNC_ID = 'telemetry-compare'

function Panel({
  data,
  dataKeyA,
  dataKeyB,
  colorA,
  colorB,
  label,
  domain,
  unit,
}: {
  data: ChartRow[]
  dataKeyA: string
  dataKeyB: string
  colorA: string
  colorB: string
  label: string
  domain: [number, number]
  unit: string
}) {
  return (
    <div className="h-28">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[9px] font-mono text-text-tertiary tracking-wider">{label}</span>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} syncId={SYNC_ID} margin={{ top: 2, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="distance"
            type="number"
            domain={[0, 100]}
            tick={false}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={domain}
            width={32}
            tick={{ fontSize: 8, fill: '#5A5A66' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const row = payload[0]?.payload as ChartRow
              const valA = row?.[dataKeyA as keyof ChartRow]
              const valB = row?.[dataKeyB as keyof ChartRow]
              return (
                <div style={{
                  backgroundColor: '#161619',
                  border: '1px solid #2A2A30',
                  borderRadius: 8,
                  fontSize: 10,
                  fontFamily: 'monospace',
                  padding: '6px 10px',
                  lineHeight: 1.8,
                }}>
                  <div style={{ color: '#5A5A66', marginBottom: 2 }}>{Number(label).toFixed(1)}% distance</div>
                  <div style={{ color: colorA }}>{valA !== undefined ? `${valA} ${unit}` : '—'}</div>
                  <div style={{ color: colorB }}>{valB !== undefined ? `${valB} ${unit}` : '—'}</div>
                </div>
              )
            }}
          />
          <ReferenceLine y={0} stroke="#2A2A30" />
          <Line type="monotone" dataKey={dataKeyA} stroke={colorA} dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls />
          <Line type="monotone" dataKey={dataKeyB} stroke={colorB} dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function TelemetryChart({ driverA, driverB }: TelemetryChartProps) {
  const data = mergeChannels(driverA?.data ?? null, driverB?.data ?? null)
  const colorA = driverA?.color ?? '#fff'
  const colorB = driverB?.color ?? '#888'

  if (data.length === 0) return null

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 space-y-1">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-2">
        {driverA && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded" style={{ backgroundColor: colorA }} />
            <span className="text-[10px] font-mono" style={{ color: colorA }}>
              {driverA.abbreviation} — Lap {driverA.data.lap_number}{driverA.data.lap_time ? ` (${driverA.data.lap_time})` : ''}
            </span>
          </div>
        )}
        {driverB && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded" style={{ backgroundColor: colorB }} />
            <span className="text-[10px] font-mono" style={{ color: colorB }}>
              {driverB.abbreviation} — Lap {driverB.data.lap_number}{driverB.data.lap_time ? ` (${driverB.data.lap_time})` : ''}
            </span>
          </div>
        )}
      </div>

      <Panel data={data} dataKeyA="speedA" dataKeyB="speedB" colorA={colorA} colorB={colorB} label="SPEED" domain={[0, 350]} unit="km/h" />
      <Panel data={data} dataKeyA="thrA" dataKeyB="thrB" colorA={colorA} colorB={colorB} label="THROTTLE" domain={[0, 100]} unit="%" />
      <Panel data={data} dataKeyA="brkA" dataKeyB="brkB" colorA={colorA} colorB={colorB} label="BRAKE" domain={[0, 100]} unit="%" />

      {/* Distance axis label */}
      <div className="flex justify-between text-[8px] font-mono text-text-tertiary px-8">
        <span>0%</span>
        <span>LAP DISTANCE</span>
        <span>100%</span>
      </div>
    </div>
  )
}
