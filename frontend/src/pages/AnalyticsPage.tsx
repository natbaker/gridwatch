import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, CartesianGrid,
} from 'recharts'
import { useSeasonProgression, usePredictions } from '../hooks/useAnalytics'
import { useSeason } from '../hooks/useSeason'
import { LoadingSkeleton } from '../components/common/LoadingSkeleton'
import { ErrorState } from '../components/common/ErrorState'
import type { ConstructorSeries, DriverSeries } from '../types'

const TOOLTIP_STYLE = { backgroundColor: '#111', border: '1px solid #333', borderRadius: 8, fontSize: 12, color: '#eee' }
const TOOLTIP_LABEL_STYLE = { color: '#fff', fontWeight: 600, marginBottom: 2 }
const TOOLTIP_ITEM_STYLE = { color: '#ddd', padding: '1px 0' }

type ChartTab = 'drivers' | 'constructors' | 'positions' | 'predictions'

interface ChartSeries {
  key: string
  color: string
  valueByRound: Map<number, number>
}

function driverSeries(drivers: DriverSeries[], metric: 'points' | 'position'): ChartSeries[] {
  return drivers.map(d => ({
    key: d.code,
    color: d.team_color,
    valueByRound: new Map(d.progression.map(p => [p.round, p[metric]])),
  }))
}

function constructorSeries(constructors: ConstructorSeries[]): ChartSeries[] {
  return constructors.map(c => ({
    key: c.name,
    color: c.team_color,
    valueByRound: new Map(c.progression.map(p => [p.round, p.points])),
  }))
}

function SeriesLegend({ series, highlighted, onHighlight }: {
  series: ChartSeries[]
  highlighted: string | null
  onHighlight: (key: string | null) => void
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {series.map(s => (
        <button
          key={s.key}
          onMouseEnter={() => onHighlight(s.key)}
          onMouseLeave={() => onHighlight(null)}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono hover:bg-bg-elevated transition-colors"
          style={{ opacity: highlighted && highlighted !== s.key ? 0.4 : 1 }}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
          {s.key}
        </button>
      ))}
    </div>
  )
}

function ProgressionChart({ series, rounds, highlighted, onHighlight, positions = false }: {
  series: ChartSeries[]
  rounds: { round: number; name: string }[]
  highlighted: string | null
  onHighlight: (key: string | null) => void
  positions?: boolean
}) {
  const chartData = rounds.map(r => {
    const entry: Record<string, unknown> = { round: `R${r.round}`, name: r.name }
    for (const s of series) {
      entry[s.key] = s.valueByRound.get(r.round) ?? null
    }
    return entry
  })

  return (
    <div>
      <SeriesLegend series={series} highlighted={highlighted} onHighlight={onHighlight} />
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="round" tick={{ fontSize: 10, fill: '#888' }} />
          {positions
            ? <YAxis reversed tick={{ fontSize: 10, fill: '#888' }} domain={[1, 20]} />
            : <YAxis tick={{ fontSize: 10, fill: '#888' }} />}
          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''} />
          {series.map(s => (
            <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color}
              strokeWidth={highlighted === s.key ? (positions ? 2.5 : 3) : highlighted ? 1 : (positions ? 1.5 : 2)}
              strokeOpacity={highlighted && highlighted !== s.key ? 0.15 : 1}
              dot={positions ? { r: highlighted === s.key ? 3 : 2, fill: s.color } : false}
              connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function TrendArrow({ direction }: { direction: string }) {
  if (direction === 'up') return <span className="text-green-400 text-sm">▲</span>
  if (direction === 'down') return <span className="text-red-400 text-sm">▼</span>
  return <span className="text-text-tertiary text-sm">●</span>
}

function PredictionsPanel() {
  const { data, isLoading, isError, refetch } = usePredictions()

  if (isLoading) return <LoadingSkeleton className="h-80" />
  if (isError) return <ErrorState message="Failed to load predictions" onRetry={refetch} />
  if (!data) return null

  return (
    <div className="space-y-6">
      {/* Championship Probabilities */}
      {data.championship_probabilities.length > 0 && (
        <div className="bg-bg-card border border-border rounded-xl p-4">
          <h3 className="text-xs text-text-secondary tracking-[2px] mb-1">CHAMPIONSHIP PROBABILITY</h3>
          <p className="text-[10px] text-text-tertiary mb-4">Monte Carlo simulation (10,000 runs) based on finish distributions</p>
          <div className="space-y-3">
            {data.championship_probabilities.slice(0, 5).map(d => (
              <div key={d.code} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full" style={{ backgroundColor: d.team_color }} />
                    <span className="font-mono text-xs font-semibold">{d.code}</span>
                    <span className="text-[10px] text-text-tertiary">{d.name}</span>
                  </div>
                  <span className="font-mono text-sm font-bold" style={{ color: d.team_color }}>
                    {d.win_probability.toFixed(1)}%
                  </span>
                </div>
                <div className="flex gap-1 items-center">
                  <div className="flex-1 bg-bg-elevated rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${d.win_probability}%`, backgroundColor: d.team_color, opacity: 0.8 }}
                    />
                  </div>
                  <span className="text-[9px] text-text-tertiary font-mono w-16 text-right">
                    P3: {d.podium_probability.toFixed(0)}%
                  </span>
                </div>
                <div className="flex gap-4 text-[10px] text-text-tertiary font-mono pl-3">
                  <span>Now: {d.current_points}pts</span>
                  <span>Avg proj: {d.avg_projected_points}pts</span>
                  {d.p10_points !== undefined && (
                    <span className="hidden sm:inline">Range: {d.p10_points}–{d.p90_points}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Constructor Championship Probabilities */}
      {data.constructor_championship_probabilities.length > 0 && (
        <div className="bg-bg-card border border-border rounded-xl p-4">
          <h3 className="text-xs text-text-secondary tracking-[2px] mb-1">CONSTRUCTOR CHAMPIONSHIP PROBABILITY</h3>
          <p className="text-[10px] text-text-tertiary mb-4">Monte Carlo simulation (10,000 runs)</p>
          <div className="space-y-3">
            {data.constructor_championship_probabilities.slice(0, 5).map(c => (
              <div key={c.name} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full" style={{ backgroundColor: c.team_color }} />
                    <span className="font-mono text-xs font-semibold">{c.name}</span>
                  </div>
                  <span className="font-mono text-sm font-bold" style={{ color: c.team_color }}>
                    {c.win_probability.toFixed(1)}%
                  </span>
                </div>
                <div className="flex gap-1 items-center">
                  <div className="flex-1 bg-bg-elevated rounded-full h-3 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${c.win_probability}%`, backgroundColor: c.team_color, opacity: 0.8 }} />
                  </div>
                  <span className="text-[9px] text-text-tertiary font-mono w-32 text-right">
                    {c.p10_points}–{c.p90_points} pts range
                  </span>
                </div>
                <div className="flex gap-4 text-[10px] text-text-tertiary font-mono pl-3">
                  <span>Now: {c.current_points}pts</span>
                  <span>Avg proj: {c.avg_projected_points}pts</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form Guide */}
      {data.form_guide.length > 0 && (
        <div className="bg-bg-card border border-border rounded-xl p-4">
          <h3 className="text-xs text-text-secondary tracking-[2px] mb-1">FORM GUIDE</h3>
          <p className="text-[10px] text-text-tertiary mb-4">Last 5 races vs season average — who's trending up?</p>
          <div className="space-y-2">
            {data.form_guide.slice(0, 10).map(d => (
              <div key={d.code} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-bg-elevated/50">
                <TrendArrow direction={d.trending} />
                <div className="w-1 h-5 rounded-full" style={{ backgroundColor: d.team_color }} />
                <span className="font-mono text-xs w-10">{d.code}</span>
                <div className="flex-1 grid grid-cols-2 gap-4 text-[11px]">
                  <div>
                    <span className="text-text-tertiary">Pts/race: </span>
                    <span className="font-mono">{d.season_avg_points}</span>
                    <span className="text-text-tertiary"> → </span>
                    <span className={`font-mono ${d.points_trend > 0 ? 'text-green-400' : d.points_trend < 0 ? 'text-red-400' : ''}`}>
                      {d.recent_avg_points}
                    </span>
                  </div>
                  <div className="hidden sm:block">
                    <span className="text-text-tertiary">Avg finish: </span>
                    <span className="font-mono">{d.season_avg_finish}</span>
                    <span className="text-text-tertiary"> → </span>
                    <span className={`font-mono ${d.finish_trend > 0 ? 'text-green-400' : d.finish_trend < 0 ? 'text-red-400' : ''}`}>
                      {d.recent_avg_finish}
                    </span>
                  </div>
                </div>
                <span className={`font-mono text-xs w-14 text-right ${
                  d.points_trend > 1 ? 'text-green-400' :
                  d.points_trend < -1 ? 'text-red-400' : 'text-text-tertiary'
                }`}>
                  {d.points_trend > 0 ? '+' : ''}{d.points_trend.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Teammate Battles */}
      {data.teammate_battles.length > 0 && (
        <div className="bg-bg-card border border-border rounded-xl p-4">
          <h3 className="text-xs text-text-secondary tracking-[2px] mb-4">TEAMMATE BATTLES</h3>
          <div className="space-y-4">
            {data.teammate_battles.map(b => (
              <div key={b.team} className="space-y-2">
                <div className="flex items-center gap-2 text-[10px] text-text-tertiary">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: b.team_color }} />
                  <span className="tracking-wider">{b.team.toUpperCase()}</span>
                  <span className="ml-auto font-mono">{b.total_races} races</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-right">
                    <span className="font-mono text-xs font-semibold">{b.driver_1.code}</span>
                    <span className="text-[10px] text-text-tertiary ml-1">{b.driver_1.points}pts</span>
                  </div>
                  <div className="w-40 sm:w-56 bg-bg-elevated rounded-full h-4 overflow-hidden flex">
                    <div
                      className="h-full rounded-l-full transition-all duration-500"
                      style={{ width: `${b.dominance}%`, backgroundColor: b.team_color, opacity: 0.8 }}
                    />
                    <div
                      className="h-full rounded-r-full transition-all duration-500"
                      style={{ width: `${100 - b.dominance}%`, backgroundColor: b.team_color, opacity: 0.3 }}
                    />
                  </div>
                  <div className="flex-1">
                    <span className="font-mono text-xs font-semibold">{b.driver_2.code}</span>
                    <span className="text-[10px] text-text-tertiary ml-1">{b.driver_2.points}pts</span>
                  </div>
                </div>
                <div className="flex justify-between text-[10px] text-text-tertiary font-mono px-1">
                  <span>Race: {b.driver_1.race_wins}–{b.driver_2.race_wins}</span>
                  <span>Quali: {b.driver_1.quali_wins}–{b.driver_2.quali_wins}</span>
                  <span>Gap: {b.points_gap}pts</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projections bar chart */}
      {data.projections.length > 0 && (
        <div className="bg-bg-card border border-border rounded-xl p-4">
          <h3 className="text-xs text-text-secondary tracking-[2px] mb-1">PROJECTED FINAL STANDINGS</h3>
          <p className="text-[10px] text-text-tertiary mb-3">Linear extrapolation to ~24 races ({data.total_rounds} completed)</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.projections} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#ccc' }} />
              <YAxis type="category" dataKey="code" tick={{ fontSize: 10, fill: '#ccc' }} width={40} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="current_points" name="Current" radius={[0, 2, 2, 0]}>
                {data.projections.map(p => (
                  <Cell key={p.code} fill={p.team_color} fillOpacity={0.9} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Insights cards */}
      {data.insights.map(insight => (
        <div key={insight.type} className="bg-bg-card border border-border rounded-xl p-4">
          <h3 className="text-xs text-text-secondary tracking-[2px] mb-3">{insight.title.toUpperCase()}</h3>
          <div className="space-y-2">
            {insight.data.map((item, j) => (
              <div key={item.code ?? item.name ?? j} className="flex items-center gap-3 text-sm py-1.5">
                <span className="text-text-tertiary font-mono w-5">{j + 1}</span>
                <div className="w-1 h-5 rounded-full" style={{ backgroundColor: item.team_color ?? '#888' }} />
                <span className="font-medium flex-1">{item.name ?? item.code}</span>
                {insight.type === 'race_craft' && item.avg_gain !== undefined && (
                  <span className={`font-mono text-xs ${item.avg_gain > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {item.avg_gain > 0 ? '+' : ''}{item.avg_gain.toFixed(1)} pos
                  </span>
                )}
                {insight.type === 'consistency' && item.consistency !== undefined && (
                  <span className="font-mono text-xs text-text-secondary">{item.consistency.toFixed(1)} σ</span>
                )}
                {insight.type === 'constructor_pace' && item.avg_points_per_race !== undefined && (
                  <span className="font-mono text-xs text-text-secondary">{item.avg_points_per_race.toFixed(1)} pts/race</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* DNF rates */}
      {data.dnf_rates.some(d => d.dnf_rate > 0) && (
        <div className="bg-bg-card border border-border rounded-xl p-4">
          <h3 className="text-xs text-text-secondary tracking-[2px] mb-3">RETIREMENT RATE</h3>
          <div className="space-y-2">
            {data.dnf_rates.filter(d => d.dnf_rate > 0).slice(0, 8).map(d => (
              <div key={d.code} className="flex items-center gap-3 text-sm py-1.5">
                <div className="w-1 h-5 rounded-full" style={{ backgroundColor: d.team_color }} />
                <span className="font-mono text-xs w-10">{d.code}</span>
                <div className="flex-1 bg-bg-elevated rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full bg-red-500/70"
                    style={{ width: `${Math.min(d.dnf_rate, 100)}%` }} />
                </div>
                <span className="font-mono text-xs text-text-tertiary w-20 text-right">
                  {d.dnfs}/{d.races} ({d.dnf_rate}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatsGrid({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div className="overflow-y-auto max-h-[310px] pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:transparent">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {children}
        </div>
      </div>
    </div>
  )
}

function StatCard({ id, color, title, subtitle, highlighted, onHighlight, children }: {
  id: string
  color: string
  title: string
  subtitle?: string
  highlighted: string | null
  onHighlight: (key: string | null) => void
  children: ReactNode
}) {
  const isHL = highlighted === id
  return (
    <div
      className={`bg-bg-card border rounded-xl p-3 transition-colors cursor-default ${isHL ? 'border-text-secondary' : 'border-border'}`}
      onMouseEnter={() => onHighlight(id)}
      onMouseLeave={() => onHighlight(null)}
      style={{ opacity: highlighted && !isHL ? 0.5 : 1 }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1 h-6 rounded-full" style={{ backgroundColor: color }} />
        {subtitle ? (
          <div>
            <span className="font-mono text-xs font-semibold">{title}</span>
            <p className="text-[10px] text-text-tertiary">{subtitle}</p>
          </div>
        ) : (
          <span className="font-mono text-xs font-semibold truncate">{title}</span>
        )}
      </div>
      <div className="space-y-1 text-[11px]">
        {children}
      </div>
    </div>
  )
}

function Stat({ label, value, valueClass = '' }: { label: string; value: ReactNode; valueClass?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-text-tertiary">{label}</span>
      <span className={`font-mono ${valueClass}`}>{value}</span>
    </div>
  )
}

export function AnalyticsPage() {
  const { season } = useSeason()
  const { data, isLoading, isError, refetch } = useSeasonProgression()
  const [tab, setTab] = useState<ChartTab>('drivers')
  const [highlighted, setHighlighted] = useState<string | null>(null)

  if (isLoading) return (
    <div className="max-w-[1280px] mx-auto px-5 py-6">
      <LoadingSkeleton className="h-96" />
    </div>
  )

  if (isError) return (
    <div className="max-w-[1280px] mx-auto px-5 py-6">
      <ErrorState message="Failed to load analytics" onRetry={refetch} />
    </div>
  )

  if (!data?.drivers?.length) return (
    <div className="max-w-[1280px] mx-auto px-5 py-6">
      <div className="bg-bg-card border border-border rounded-xl p-8 text-center">
        <p className="text-text-secondary">No race data available for {season} yet.</p>
      </div>
    </div>
  )

  const tabs: { key: ChartTab; label: string }[] = [
    { key: 'drivers', label: 'DRIVER POINTS' },
    { key: 'constructors', label: 'CONSTRUCTORS' },
    { key: 'positions', label: 'POSITIONS' },
    { key: 'predictions', label: 'PREDICTIONS' },
  ]

  return (
    <div className="max-w-[1280px] mx-auto px-5 py-6 space-y-5 animate-fade-in-up">
      <div className="bg-bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <div>
            <span className="text-[10px] text-text-tertiary tracking-wider font-mono">{season} SEASON</span>
            <h1 className="font-display text-xl sm:text-2xl font-bold mt-1">ANALYTICS</h1>
          </div>
          <div className="text-xs text-text-tertiary font-mono">
            {data.rounds.length} RACES
          </div>
        </div>
      </div>

      <div className="flex gap-1 bg-bg-elevated rounded-lg p-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 text-[11px] font-medium py-2 px-3 rounded-md transition-colors ${
              tab === t.key ? 'bg-bg-card text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'predictions' && (
        <div className="bg-bg-card border border-border rounded-xl p-4 sm:p-5">
          {tab === 'drivers' && (
            <ProgressionChart series={driverSeries(data.drivers, 'points')} rounds={data.rounds}
              highlighted={highlighted} onHighlight={setHighlighted} />
          )}
          {tab === 'constructors' && (
            <ProgressionChart series={constructorSeries(data.constructors)} rounds={data.rounds}
              highlighted={highlighted} onHighlight={setHighlighted} />
          )}
          {tab === 'positions' && (
            <ProgressionChart series={driverSeries(data.drivers, 'position')} rounds={data.rounds}
              highlighted={highlighted} onHighlight={setHighlighted} positions />
          )}
        </div>
      )}

      {tab === 'predictions' && <PredictionsPanel />}

      {/* Driver stats grid */}
      {tab === 'drivers' && (
        <StatsGrid>
          {data.drivers.map(d => {
            const wins = d.progression.filter(r => r.position === 1).length
            const podiums = d.progression.filter(r => r.position <= 3).length
            const dnfs = d.progression.filter(r => r.dnf).length
            return (
              <StatCard key={d.code} id={d.code} color={d.team_color} title={d.code} subtitle={d.team}
                highlighted={highlighted} onHighlight={setHighlighted}>
                <Stat label="Points" value={d.total_points} />
                <Stat label="Wins" value={wins} />
                <Stat label="Podiums" value={podiums} />
                {dnfs > 0 && <Stat label="DNFs" value={dnfs} valueClass="text-red-400" />}
              </StatCard>
            )
          })}
        </StatsGrid>
      )}

      {/* Constructor stats grid */}
      {tab === 'constructors' && (
        <StatsGrid>
          {data.constructors.map(c => {
            const cDrivers = data.drivers.filter(d => d.team === c.name)
            const totalWins = cDrivers.reduce((sum, d) => sum + d.progression.filter(r => r.position === 1).length, 0)
            const totalPodiums = cDrivers.reduce((sum, d) => sum + d.progression.filter(r => r.position <= 3).length, 0)
            const races = c.progression.length
            const ptsPerRace = races > 0 ? (c.total_points / races).toFixed(1) : '0'
            return (
              <StatCard key={c.name} id={c.name} color={c.team_color} title={c.name}
                highlighted={highlighted} onHighlight={setHighlighted}>
                <Stat label="Points" value={c.total_points} />
                <Stat label="Pts/Race" value={ptsPerRace} />
                <Stat label="Wins" value={totalWins} />
                <Stat label="Podiums" value={totalPodiums} />
                <div className="text-[10px] text-text-tertiary pt-1 border-t border-border/50">
                  {cDrivers.map(d => d.code).join(' · ')}
                </div>
              </StatCard>
            )
          })}
        </StatsGrid>
      )}

      {/* Position stats grid */}
      {tab === 'positions' && (
        <StatsGrid>
          {data.drivers.map(d => {
            const races = d.progression.length
            const avgFinish = races > 0 ? (d.progression.reduce((s, r) => s + r.position, 0) / races).toFixed(1) : '-'
            const bestFinish = races > 0 ? Math.min(...d.progression.map(r => r.position)) : '-'
            const gains = d.progression.filter(r => r.positions_gained !== null)
            const gainNum = gains.length > 0
              ? gains.reduce((s, r) => s + (r.positions_gained ?? 0), 0) / gains.length
              : 0
            const gainStr = gains.length > 0 ? gainNum.toFixed(1) : '-'
            return (
              <StatCard key={d.code} id={d.code} color={d.team_color} title={d.code} subtitle={d.team}
                highlighted={highlighted} onHighlight={setHighlighted}>
                <Stat label="Avg Finish" value={`P${avgFinish}`} />
                <Stat label="Best" value={`P${bestFinish}`} />
                <Stat label="Avg Gain" value={`${gainNum > 0 ? '+' : ''}${gainStr}`}
                  valueClass={gainNum > 0 ? 'text-green-400' : gainNum < 0 ? 'text-red-400' : ''} />
                {/* Race-by-race color bars — no numbers to avoid overflow on long seasons */}
                <div className="flex gap-px pt-1 border-t border-border/50">
                  {d.progression.map((r, i) => (
                    <div key={i} title={`R${r.round} P${r.position}`} className={`flex-1 h-3 rounded-sm ${
                      r.position === 1 ? 'bg-yellow-500/60' :
                      r.position <= 3 ? 'bg-accent/50' :
                      r.position <= 10 ? 'bg-bg-elevated' :
                      'bg-bg-elevated/40'
                    }`} />
                  ))}
                </div>
              </StatCard>
            )
          })}
        </StatsGrid>
      )}
    </div>
  )
}
