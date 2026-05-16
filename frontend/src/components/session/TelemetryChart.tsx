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

// Simultaneous throttle+brake = probable 2026-style harvest braking
const HARVEST_THR = 30
const HARVEST_BRK = 15

function computeHarvestRanges(
  data: ChartRow[],
  thrKey: 'thrA' | 'thrB',
  brkKey: 'brkA' | 'brkB',
): { x1: number; x2: number }[] {
  const ranges: { x1: number; x2: number }[] = []
  let start: number | null = null
  for (const row of data) {
    const harvesting = (row[thrKey] ?? 0) >= HARVEST_THR && (row[brkKey] ?? 0) >= HARVEST_BRK
    if (harvesting && start === null) {
      start = row.distance
    } else if (!harvesting && start !== null) {
      ranges.push({ x1: start, x2: row.distance })
      start = null
    }
  }
  if (start !== null && data.length > 0) {
    ranges.push({ x1: start, x2: data[data.length - 1].distance })
  }
  return ranges
}

// Recharts chart area: YAxis width=32, right margin=8 — harvest bars must match
const CHART_LEFT = 32
const CHART_RIGHT = 8

function HarvestBar({
  ranges,
  color,
  abbr,
  dashed,
}: {
  ranges: { x1: number; x2: number }[]
  color: string
  abbr: string
  dashed?: boolean
}) {
  return (
    <div className="flex items-center gap-0" style={{ paddingLeft: CHART_LEFT, paddingRight: CHART_RIGHT }}>
      <div className="relative flex-1 h-3.5 bg-white/5 rounded overflow-hidden">
        {ranges.map((r, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0"
            style={{
              left: `${r.x1}%`,
              width: `${Math.max(r.x2 - r.x1, 0.5)}%`,
              backgroundColor: color,
              opacity: 0.6,
            }}
          />
        ))}
        <span
          className="absolute left-1.5 top-0 bottom-0 flex items-center text-[8px] font-mono z-10"
          style={{ color, mixBlendMode: 'screen' }}
        >
          {abbr}
          {dashed && <span className="ml-0.5 opacity-60">- -</span>}
        </span>
      </div>
    </div>
  )
}

function Panel({
  data,
  dataKeyA,
  dataKeyB,
  colorA,
  colorB,
  abbrA,
  abbrB,
  label,
  domain,
  unit,
  sectorMarkers,
  isFirst,
}: {
  data: ChartRow[]
  dataKeyA: string
  dataKeyB: string
  colorA: string
  colorB: string
  abbrA: string
  abbrB: string
  label: string
  domain: [number, number]
  unit: string
  sectorMarkers?: { pct: number; label: string }[]
  isFirst?: boolean
}) {
  return (
    <div className="h-28">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[9px] font-mono text-text-tertiary tracking-wider">{label}</span>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} syncId={SYNC_ID} margin={{ top: isFirst ? 12 : 2, right: 8, bottom: 0, left: 0 }}>
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
                  <div style={{ color: colorA }}>{abbrA}: {valA !== undefined ? `${valA} ${unit}` : '—'}</div>
                  <div style={{ color: colorB }}>{abbrB}: {valB !== undefined ? `${valB} ${unit}` : '—'}</div>
                </div>
              )
            }}
          />
          <ReferenceLine y={0} stroke="#2A2A30" />
          {sectorMarkers?.map(m => (
            <ReferenceLine
              key={m.label}
              x={m.pct}
              stroke="rgba(255,255,255,0.15)"
              strokeDasharray="3 3"
              label={isFirst ? { value: m.label, position: 'top', fontSize: 8, fill: '#5A5A66', fontFamily: 'monospace' } : undefined}
            />
          ))}
          <Line type="monotone" dataKey={dataKeyA} stroke={colorA} dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls />
          <Line type="monotone" dataKey={dataKeyB} stroke={colorB} dot={false} strokeWidth={1.5} strokeDasharray="6 3" isAnimationActive={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function TelemetryChart({ driverA, driverB }: TelemetryChartProps) {
  const data = mergeChannels(driverA?.data ?? null, driverB?.data ?? null)
  const colorA = driverA?.color ?? '#fff'
  const colorB = driverB?.color ?? '#888'
  const abbrA = driverA?.abbreviation ?? ''
  const abbrB = driverB?.abbreviation ?? ''
  const sectorMarkers = driverA?.data.sector_markers ?? driverB?.data.sector_markers ?? []

  if (data.length === 0) return null

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 space-y-1">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-2">
        {driverA && (
          <div className="flex items-center gap-1.5">
            <svg width="16" height="6" className="shrink-0">
              <line x1="0" y1="3" x2="16" y2="3" stroke={colorA} strokeWidth="2" />
            </svg>
            <span className="text-[10px] font-mono" style={{ color: colorA }}>
              {driverA.abbreviation} — Lap {driverA.data.lap_number}{driverA.data.lap_time ? ` (${driverA.data.lap_time})` : ''}
            </span>
          </div>
        )}
        {driverB && (
          <div className="flex items-center gap-1.5">
            <svg width="16" height="6" className="shrink-0">
              <line x1="0" y1="3" x2="16" y2="3" stroke={colorB} strokeWidth="2" strokeDasharray="5 2" />
            </svg>
            <span className="text-[10px] font-mono" style={{ color: colorB }}>
              {driverB.abbreviation} — Lap {driverB.data.lap_number}{driverB.data.lap_time ? ` (${driverB.data.lap_time})` : ''}
            </span>
          </div>
        )}
      </div>

      <Panel data={data} dataKeyA="speedA" dataKeyB="speedB" colorA={colorA} colorB={colorB} abbrA={abbrA} abbrB={abbrB} label="SPEED" domain={[0, 350]} unit="km/h" sectorMarkers={sectorMarkers} isFirst />
      <Panel data={data} dataKeyA="thrA" dataKeyB="thrB" colorA={colorA} colorB={colorB} abbrA={abbrA} abbrB={abbrB} label="THROTTLE" domain={[0, 100]} unit="%" sectorMarkers={sectorMarkers} />
      <Panel data={data} dataKeyA="brkA" dataKeyB="brkB" colorA={colorA} colorB={colorB} abbrA={abbrA} abbrB={abbrB} label="BRAKE" domain={[0, 100]} unit="%" sectorMarkers={sectorMarkers} />

      {/* Harvest zone indicator — only rendered when the pattern is actually detected */}
      {(() => {
        const harvestA = abbrA ? computeHarvestRanges(data, 'thrA', 'brkA') : []
        const harvestB = abbrB ? computeHarvestRanges(data, 'thrB', 'brkB') : []
        if (!harvestA.length && !harvestB.length) return null
        return (
          <div className="pt-1 space-y-1">
            <span className="text-[9px] font-mono text-text-tertiary tracking-wider">
              HARVEST BRAKING <span className="text-text-tertiary/50">(thr≥{HARVEST_THR}% + brk≥{HARVEST_BRK}%)</span>
            </span>
            {harvestA.length > 0 && <HarvestBar ranges={harvestA} color={colorA} abbr={abbrA} />}
            {harvestB.length > 0 && <HarvestBar ranges={harvestB} color={colorB} abbr={abbrB} dashed />}
          </div>
        )
      })()}

      {/* Distance axis label */}
      <div className="flex justify-between text-[8px] font-mono text-text-tertiary px-8">
        <span>0%</span>
        <span>LAP DISTANCE</span>
        <span>100%</span>
      </div>
    </div>
  )
}
