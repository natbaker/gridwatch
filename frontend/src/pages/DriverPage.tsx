import { Link, useParams } from 'react-router-dom'
import { useDriverStats } from '../hooks/useAnalytics'
import { LoadingSkeleton } from '../components/common/LoadingSkeleton'
import { ErrorState } from '../components/common/ErrorState'

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-bg-elevated rounded-lg px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-wider text-text-tertiary">{label}</div>
      <div className="text-lg font-display font-bold tabular-nums">{value}</div>
    </div>
  )
}

export function DriverPage() {
  const { code } = useParams<{ code: string }>()
  const { data, isLoading, error, refetch } = useDriverStats(code ?? '')

  if (isLoading) {
    return (
      <div className="max-w-[1000px] mx-auto px-5 py-6">
        <LoadingSkeleton className="h-96" />
      </div>
    )
  }

  const driver = data?.driver
  if (error || !driver) {
    return (
      <div className="max-w-[1000px] mx-auto px-5 py-6 space-y-4">
        <Link to="/analytics" className="text-sm text-accent hover:underline">← Analytics</Link>
        <ErrorState message={`No data for driver ${code ?? ''}`} onRetry={() => refetch()} />
      </div>
    )
  }

  const fmt = (v: number | null, digits = 1) => (v == null ? '—' : v.toFixed(digits))

  return (
    <div className="max-w-[1000px] mx-auto px-5 py-6 space-y-5 animate-fade-in-up">
      <Link to="/analytics" className="text-sm text-accent hover:underline">← Analytics</Link>

      <div className="bg-bg-card border border-border rounded-xl p-5 flex items-center gap-4">
        <div className="w-1.5 h-12 rounded-sm" style={{ backgroundColor: driver.team_color }} />
        <div>
          <h1 className="font-display text-2xl font-bold">{driver.name}</h1>
          <p className="text-sm text-text-secondary">{driver.team} · {driver.code}</p>
        </div>
        <div className="ml-auto text-right">
          <div className="text-3xl font-display font-bold tabular-nums">{driver.total_points}</div>
          <div className="text-[10px] uppercase tracking-wider text-text-tertiary">points</div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Races" value={driver.races} />
        <Stat label="Wins" value={driver.wins} />
        <Stat label="Podiums" value={driver.podiums} />
        <Stat label="Top 10" value={driver.top_10} />
        <Stat label="DNFs" value={driver.dnfs} />
        <Stat label="Best finish" value={driver.best_finish ?? '—'} />
        <Stat label="Avg finish" value={fmt(driver.avg_finish)} />
        <Stat label="Avg grid" value={fmt(driver.avg_grid)} />
      </div>

      {driver.teammate && (
        <div className="bg-bg-card border border-border rounded-xl p-4">
          <h3 className="text-xs tracking-[2px] text-text-secondary mb-3">TEAMMATE BATTLE</h3>
          <div className="flex items-center justify-between text-sm">
            <span className="font-mono">{driver.code}</span>
            <span className="font-display font-bold">{driver.teammate.h2h}</span>
            <span className="font-mono text-text-secondary">{driver.teammate.code}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-text-tertiary mt-1">
            <span>{driver.total_points} pts</span>
            <span>head-to-head</span>
            <span>{driver.teammate.total_points} pts</span>
          </div>
        </div>
      )}

      {driver.avg_positions_gained != null && (
        <p className="text-xs text-text-tertiary">
          Average positions gained from grid: <span className="text-text-secondary font-mono">{fmt(driver.avg_positions_gained)}</span>
        </p>
      )}
    </div>
  )
}
