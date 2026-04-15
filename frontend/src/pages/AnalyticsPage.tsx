import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, CartesianGrid,
} from 'recharts'
import { useSeasonProgression, usePredictions } from '../hooks/useAnalytics'
import { useSeason } from '../hooks/useSeason'
import { LoadingSkeleton } from '../components/common/LoadingSkeleton'
import { ErrorState } from '../components/common/ErrorState'
import type { DriverSeries, ConstructorSeries } from '../types'

const TOOLTIP_STYLE = { backgroundColor: '#111', border: '1px solid #333', borderRadius: 8, fontSize: 12, color: '#eee' }
const TOOLTIP_LABEL_STYLE = { color: '#fff', fontWeight: 600, marginBottom: 2 }
const TOOLTIP_ITEM_STYLE = { color: '#ddd', padding: '1px 0' }

type ChartTab = 'drivers' | 'constructors' | 'positions' | 'predictions'

function PointsChart({ drivers, rounds }: { drivers: DriverSeries[]; rounds: { round: number; name: string }[] }) {
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const top10 = drivers.slice(0, 10)

  const chartData = rounds.map(r => {
    const entry: Record<string, unknown> = { round: `R${r.round}`, name: r.name }
    for (const d of top10) {
      const prog = d.progression.find(p => p.round === r.round)
      entry[d.code] = prog?.points ?? null
    }
    return entry
  })

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {top10.map(d => (
          <button
            key={d.code}
            onMouseEnter={() => setHighlighted(d.code)}
            onMouseLeave={() => setHighlighted(null)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono hover:bg-bg-elevated transition-colors"
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.team_color }} />
            {d.code}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="round" tick={{ fontSize: 10, fill: '#888' }} />
          <YAxis tick={{ fontSize: 10, fill: '#888' }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''} />
          {top10.map(d => (
            <Line key={d.code} type="monotone" dataKey={d.code} stroke={d.team_color}
              strokeWidth={highlighted === d.code ? 3 : highlighted ? 1 : 2}
              strokeOpacity={highlighted && highlighted !== d.code ? 0.2 : 1}
              dot={false} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function ConstructorChart({ constructors, rounds }: { constructors: ConstructorSeries[]; rounds: { round: number; name: string }[] }) {
  const chartData = rounds.map(r => {
    const entry: Record<string, unknown> = { round: `R${r.round}`, name: r.name }
    for (const c of constructors) {
      const prog = c.progression.find(p => p.round === r.round)
      entry[c.name] = prog?.points ?? null
    }
    return entry
  })

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="round" tick={{ fontSize: 10, fill: '#888' }} />
        <YAxis tick={{ fontSize: 10, fill: '#888' }} />
        <Tooltip contentStyle={TOOLTIP_STYLE}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''} />
        {constructors.map(c => (
          <Line key={c.name} type="monotone" dataKey={c.name} stroke={c.team_color}
            strokeWidth={2} dot={false} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function PositionChart({ drivers, rounds }: { drivers: DriverSeries[]; rounds: { round: number; name: string }[] }) {
  const top10 = drivers.slice(0, 10)
  const chartData = rounds.map(r => {
    const entry: Record<string, unknown> = { round: `R${r.round}`, name: r.name }
    for (const d of top10) {
      const prog = d.progression.find(p => p.round === r.round)
      entry[d.code] = prog?.position ?? null
    }
    return entry
  })

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="round" tick={{ fontSize: 10, fill: '#888' }} />
        <YAxis reversed tick={{ fontSize: 10, fill: '#888' }} domain={[1, 20]} />
        <Tooltip contentStyle={TOOLTIP_STYLE}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''} />
        {top10.map(d => (
          <Line key={d.code} type="monotone" dataKey={d.code} stroke={d.team_color}
            strokeWidth={1.5} dot={{ r: 2, fill: d.team_color }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
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

  const hasProjections = data.projections && data.projections.length > 0
  const hasChampProbs = data.championship_probabilities && data.championship_probabilities.length > 0
  const hasForm = data.form_guide && data.form_guide.length > 0
  const hasTeammate = data.teammate_battles && data.teammate_battles.length > 0

  return (
    <div className="space-y-6">
      {/* Championship Probabilities */}
      {hasChampProbs && (
        <div className="bg-bg-card border border-border rounded-xl p-4">
          <h3 className="text-xs text-text-secondary tracking-[2px] mb-1">CHAMPIONSHIP PROBABILITY</h3>
          <p className="text-[10px] text-text-tertiary mb-4">Monte Carlo simulation (10,000 runs) based on finish distributions</p>
          <div className="space-y-3">
            {data.championship_probabilities.filter((d: Record<string, unknown>) => (d.win_probability as number) > 0.5).map((d: Record<string, unknown>, i: number) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-5 rounded-full" style={{ backgroundColor: d.team_color as string }} />
                    <span className="font-mono text-xs font-semibold">{d.code as string}</span>
                    <span className="text-[10px] text-text-tertiary">{d.name as string}</span>
                  </div>
                  <span className="font-mono text-sm font-bold" style={{ color: d.team_color as string }}>
                    {(d.win_probability as number).toFixed(1)}%
                  </span>
                </div>
                <div className="flex gap-1 items-center">
                  <div className="flex-1 bg-bg-elevated rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${d.win_probability as number}%`,
                        backgroundColor: d.team_color as string,
                        opacity: 0.8,
                      }}
                    />
                  </div>
                  <span className="text-[9px] text-text-tertiary font-mono w-16 text-right">
                    P3: {(d.podium_probability as number).toFixed(0)}%
                  </span>
                </div>
                <div className="flex gap-4 text-[10px] text-text-tertiary font-mono pl-3">
                  <span>Now: {d.current_points as number}pts</span>
                  <span>Avg proj: {d.avg_projected_points as number}pts</span>
                  {d.p10_points !== undefined && (
                    <span className="hidden sm:inline">Range: {d.p10_points as number}–{d.p90_points as number}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form Guide */}
      {hasForm && (
        <div className="bg-bg-card border border-border rounded-xl p-4">
          <h3 className="text-xs text-text-secondary tracking-[2px] mb-1">FORM GUIDE</h3>
          <p className="text-[10px] text-text-tertiary mb-4">Last 5 races vs season average — who's trending up?</p>
          <div className="space-y-2">
            {data.form_guide.slice(0, 10).map((d: Record<string, unknown>, i: number) => (
              <div key={i} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-bg-elevated/50">
                <TrendArrow direction={d.trending as string} />
                <div className="w-1 h-5 rounded-full" style={{ backgroundColor: d.team_color as string }} />
                <span className="font-mono text-xs w-10">{d.code as string}</span>
                <div className="flex-1 grid grid-cols-2 gap-4 text-[11px]">
                  <div>
                    <span className="text-text-tertiary">Pts/race: </span>
                    <span className="font-mono">{d.season_avg_points as number}</span>
                    <span className="text-text-tertiary"> → </span>
                    <span className={`font-mono ${(d.points_trend as number) > 0 ? 'text-green-400' : (d.points_trend as number) < 0 ? 'text-red-400' : ''}`}>
                      {d.recent_avg_points as number}
                    </span>
                  </div>
                  <div className="hidden sm:block">
                    <span className="text-text-tertiary">Avg finish: </span>
                    <span className="font-mono">{d.season_avg_finish as number}</span>
                    <span className="text-text-tertiary"> → </span>
                    <span className={`font-mono ${(d.finish_trend as number) > 0 ? 'text-green-400' : (d.finish_trend as number) < 0 ? 'text-red-400' : ''}`}>
                      {d.recent_avg_finish as number}
                    </span>
                  </div>
                </div>
                <span className={`font-mono text-xs w-14 text-right ${
                  (d.points_trend as number) > 1 ? 'text-green-400' :
                  (d.points_trend as number) < -1 ? 'text-red-400' : 'text-text-tertiary'
                }`}>
                  {(d.points_trend as number) > 0 ? '+' : ''}{(d.points_trend as number).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Teammate Battles */}
      {hasTeammate && (
        <div className="bg-bg-card border border-border rounded-xl p-4">
          <h3 className="text-xs text-text-secondary tracking-[2px] mb-4">TEAMMATE BATTLES</h3>
          <div className="space-y-4">
            {data.teammate_battles.map((b: Record<string, unknown>, i: number) => {
              const d1 = b.driver_1 as Record<string, unknown>
              const d2 = b.driver_2 as Record<string, unknown>
              const dominance = b.dominance as number
              return (
                <div key={i} className="space-y-2">
                  <div className="flex items-center gap-2 text-[10px] text-text-tertiary">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: b.team_color as string }} />
                    <span className="tracking-wider">{(b.team as string).toUpperCase()}</span>
                    <span className="ml-auto font-mono">{b.total_races as number} races</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 text-right">
                      <span className="font-mono text-xs font-semibold">{d1.code as string}</span>
                      <span className="text-[10px] text-text-tertiary ml-1">{d1.points as number}pts</span>
                    </div>
                    <div className="w-40 sm:w-56 bg-bg-elevated rounded-full h-4 overflow-hidden flex">
                      <div
                        className="h-full rounded-l-full transition-all duration-500"
                        style={{ width: `${dominance}%`, backgroundColor: b.team_color as string, opacity: 0.8 }}
                      />
                      <div
                        className="h-full rounded-r-full transition-all duration-500"
                        style={{ width: `${100 - dominance}%`, backgroundColor: b.team_color as string, opacity: 0.3 }}
                      />
                    </div>
                    <div className="flex-1">
                      <span className="font-mono text-xs font-semibold">{d2.code as string}</span>
                      <span className="text-[10px] text-text-tertiary ml-1">{d2.points as number}pts</span>
                    </div>
                  </div>
                  <div className="flex justify-between text-[10px] text-text-tertiary font-mono px-1">
                    <span>Race: {d1.race_wins as number}–{d2.race_wins as number}</span>
                    <span>Quali: {d1.quali_wins as number}–{d2.quali_wins as number}</span>
                    <span>Gap: {b.points_gap as number}pts</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Projections bar chart */}
      {hasProjections && (
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
                {data.projections.map((p: Record<string, unknown>, i: number) => (
                  <Cell key={i} fill={p.team_color as string} fillOpacity={0.9} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Insights cards */}
      {data.insights.map((insight: Record<string, unknown>, i: number) => (
        <div key={i} className="bg-bg-card border border-border rounded-xl p-4">
          <h3 className="text-xs text-text-secondary tracking-[2px] mb-3">{(insight.title as string).toUpperCase()}</h3>
          <div className="space-y-2">
            {(insight.data as Record<string, unknown>[]).map((item, j) => {
              const code = item.code as string || item.name as string
              const color = item.team_color as string || '#888'
              const type = insight.type as string
              return (
                <div key={j} className="flex items-center gap-3 text-sm py-1.5">
                  <span className="text-text-tertiary font-mono w-5">{j + 1}</span>
                  <div className="w-1 h-5 rounded-full" style={{ backgroundColor: color }} />
                  <span className="font-medium flex-1">{(item.name as string) || code}</span>
                  {type === 'race_craft' && (
                    <span className={`font-mono text-xs ${(item.avg_gain as number) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {(item.avg_gain as number) > 0 ? '+' : ''}{(item.avg_gain as number).toFixed(1)} pos
                    </span>
                  )}
                  {type === 'consistency' && (
                    <span className="font-mono text-xs text-text-secondary">{(item.consistency as number).toFixed(1)} σ</span>
                  )}
                  {type === 'constructor_pace' && (
                    <span className="font-mono text-xs text-text-secondary">{(item.avg_points_per_race as number).toFixed(1)} pts/race</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* DNF rates */}
      {data.dnf_rates.length > 0 && data.dnf_rates.some((d: Record<string, unknown>) => (d.dnf_rate as number) > 0) && (
        <div className="bg-bg-card border border-border rounded-xl p-4">
          <h3 className="text-xs text-text-secondary tracking-[2px] mb-3">RETIREMENT RATE</h3>
          <div className="space-y-2">
            {data.dnf_rates.filter((d: Record<string, unknown>) => (d.dnf_rate as number) > 0).slice(0, 8).map((d: Record<string, unknown>, i: number) => (
              <div key={i} className="flex items-center gap-3 text-sm py-1.5">
                <div className="w-1 h-5 rounded-full" style={{ backgroundColor: d.team_color as string }} />
                <span className="font-mono text-xs w-10">{d.code as string}</span>
                <div className="flex-1 bg-bg-elevated rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full bg-red-500/70"
                    style={{ width: `${Math.min(d.dnf_rate as number, 100)}%` }} />
                </div>
                <span className="font-mono text-xs text-text-tertiary w-20 text-right">
                  {d.dnfs as number}/{d.races as number} ({d.dnf_rate as number}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function AnalyticsPage() {
  const { season } = useSeason()
  const { data, isLoading, isError, refetch } = useSeasonProgression()
  const [tab, setTab] = useState<ChartTab>('drivers')

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
          {tab === 'drivers' && <PointsChart drivers={data.drivers} rounds={data.rounds} />}
          {tab === 'constructors' && <ConstructorChart constructors={data.constructors} rounds={data.rounds} />}
          {tab === 'positions' && <PositionChart drivers={data.drivers} rounds={data.rounds} />}
        </div>
      )}

      {tab === 'predictions' && <PredictionsPanel />}

      {/* Driver stats grid */}
      {tab === 'drivers' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {data.drivers.slice(0, 10).map(d => {
            const wins = d.progression.filter(r => r.position === 1).length
            const podiums = d.progression.filter(r => r.position <= 3).length
            const dnfs = d.progression.filter(r => r.dnf).length
            return (
              <div key={d.code} className="bg-bg-card border border-border rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1 h-6 rounded-full" style={{ backgroundColor: d.team_color }} />
                  <div>
                    <span className="font-mono text-xs font-semibold">{d.code}</span>
                    <p className="text-[10px] text-text-tertiary">{d.team}</p>
                  </div>
                </div>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">Points</span>
                    <span className="font-mono">{d.total_points}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">Wins</span>
                    <span className="font-mono">{wins}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">Podiums</span>
                    <span className="font-mono">{podiums}</span>
                  </div>
                  {dnfs > 0 && (
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">DNFs</span>
                      <span className="font-mono text-red-400">{dnfs}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Constructor stats grid */}
      {tab === 'constructors' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {data.constructors.map(c => {
            const drivers = data.drivers.filter(d => d.team === c.name)
            const totalWins = drivers.reduce((sum, d) => sum + d.progression.filter(r => r.position === 1).length, 0)
            const totalPodiums = drivers.reduce((sum, d) => sum + d.progression.filter(r => r.position <= 3).length, 0)
            const races = c.progression.length
            const ptsPerRace = races > 0 ? (c.total_points / races).toFixed(1) : '0'
            return (
              <div key={c.name} className="bg-bg-card border border-border rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1 h-6 rounded-full" style={{ backgroundColor: c.team_color }} />
                  <span className="font-mono text-xs font-semibold truncate">{c.name}</span>
                </div>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">Points</span>
                    <span className="font-mono">{c.total_points}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">Pts/Race</span>
                    <span className="font-mono">{ptsPerRace}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">Wins</span>
                    <span className="font-mono">{totalWins}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">Podiums</span>
                    <span className="font-mono">{totalPodiums}</span>
                  </div>
                  <div className="text-[10px] text-text-tertiary pt-1 border-t border-border/50">
                    {drivers.map(d => d.code).join(' · ')}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Position stats grid */}
      {tab === 'positions' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {data.drivers.slice(0, 10).map(d => {
            const races = d.progression.length
            const avgFinish = races > 0 ? (d.progression.reduce((s, r) => s + r.position, 0) / races).toFixed(1) : '-'
            const bestFinish = races > 0 ? Math.min(...d.progression.map(r => r.position)) : '-'
            const avgGain = d.progression.filter(r => r.positions_gained !== null)
            const gainStr = avgGain.length > 0
              ? (avgGain.reduce((s, r) => s + (r.positions_gained ?? 0), 0) / avgGain.length).toFixed(1)
              : '-'
            const gainNum = avgGain.length > 0
              ? avgGain.reduce((s, r) => s + (r.positions_gained ?? 0), 0) / avgGain.length
              : 0
            return (
              <div key={d.code} className="bg-bg-card border border-border rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1 h-6 rounded-full" style={{ backgroundColor: d.team_color }} />
                  <div>
                    <span className="font-mono text-xs font-semibold">{d.code}</span>
                    <p className="text-[10px] text-text-tertiary">{d.team}</p>
                  </div>
                </div>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">Avg Finish</span>
                    <span className="font-mono">P{avgFinish}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">Best</span>
                    <span className="font-mono">P{bestFinish}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">Avg Gain</span>
                    <span className={`font-mono ${gainNum > 0 ? 'text-green-400' : gainNum < 0 ? 'text-red-400' : ''}`}>
                      {gainNum > 0 ? '+' : ''}{gainStr}
                    </span>
                  </div>
                  <div className="flex gap-1 pt-1 border-t border-border/50">
                    {d.progression.map((r, i) => (
                      <div key={i} className={`flex-1 h-4 rounded-sm text-center text-[8px] leading-4 font-mono ${
                        r.position === 1 ? 'bg-yellow-500/30 text-yellow-400' :
                        r.position <= 3 ? 'bg-accent/20 text-accent' :
                        r.position <= 10 ? 'bg-bg-elevated text-text-tertiary' :
                        'bg-bg-elevated/50 text-text-tertiary/50'
                      }`}>
                        {r.position}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
