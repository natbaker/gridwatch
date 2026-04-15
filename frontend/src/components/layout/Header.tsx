import { useState, useEffect } from 'react'
import { NavLink, Link, useNavigate } from 'react-router-dom'
import { formatLocalTime, formatInTimezone } from '../../utils/time'
import { useSeason } from '../../hooks/useSeason'

interface HeaderProps {
  trackTimezone?: string
  trackCity?: string
}

export function Header({ trackTimezone, trackCity }: HeaderProps) {
  const { season, setSeason, availableSeasons, isCurrentSeason } = useSeason()
  const navigate = useNavigate()
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <header className="border-b border-border">
      <div className="max-w-[1280px] mx-auto px-5 h-24 flex items-center justify-between">
        <Link to="/" className="flex items-center">
          <img src="/gridwatch_logo_nav_transparent.png" alt="Grid Watch" className="w-24 h-auto" />
        </Link>

        <nav className="flex gap-6 text-sm">
          <NavLink
            to="/"
            className={({ isActive }) =>
              isActive
                ? 'text-accent border-b-2 border-accent pb-1'
                : 'text-text-secondary hover:text-text-primary transition-colors'
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/analytics"
            className={({ isActive }) =>
              isActive
                ? 'text-accent border-b-2 border-accent pb-1'
                : 'text-text-secondary hover:text-text-primary transition-colors'
            }
          >
            Analytics
          </NavLink>
          <NavLink
            to="/calendar"
            className={({ isActive }) =>
              isActive
                ? 'text-accent border-b-2 border-accent pb-1'
                : 'text-text-secondary hover:text-text-primary transition-colors'
            }
          >
            Calendar
          </NavLink>
        </nav>

        <div className="flex items-center gap-4">
          <select
            value={season}
            onChange={(e) => { setSeason(Number(e.target.value)); navigate('/calendar') }}
            className={`bg-bg-elevated border border-border rounded px-2 py-1 text-xs font-mono cursor-pointer hover:border-accent/50 transition-colors ${
              !isCurrentSeason ? 'text-accent border-accent/30' : 'text-text-secondary'
            }`}
          >
            {availableSeasons.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div className="text-xs text-text-tertiary font-mono hidden sm:block">
            <span>{formatLocalTime(now)}</span>
            {trackTimezone && trackCity && (
              <>
                <span className="mx-2">•</span>
                <span>{trackCity} {formatInTimezone(now, trackTimezone)}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
