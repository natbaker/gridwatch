import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { MeetingDataStatus, SessionDataStatus } from '../types'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1].filter(y => y >= 2023)

function StatusDot({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded ${
        active ? 'bg-green-900/40 text-green-400' : 'bg-neutral-800 text-text-tertiary'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-green-400' : 'bg-neutral-600'}`} />
      {label}
    </span>
  )
}

function SessionRow({ session }: { session: SessionDataStatus }) {
  const date = session.date_start
    ? new Date(session.date_start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '—'
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="w-24 text-xs font-mono text-text-secondary truncate">{session.session_name}</span>
      <span className="w-16 text-[10px] text-text-tertiary font-mono">{date}</span>
      <div className="flex gap-1.5 flex-wrap">
        <StatusDot active={session.has_positions} label="Replay" />
        <StatusDot active={session.has_laps} label="Timing" />
        <StatusDot active={session.has_radio} label="Radio" />
      </div>
    </div>
  )
}

function MeetingCard({ meeting }: { meeting: MeetingDataStatus }) {
  const date = meeting.date_start
    ? new Date(meeting.date_start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : ''
  const anyData = meeting.sessions.some(s => s.has_positions || s.has_laps)
  return (
    <div className={`bg-bg-card border rounded-xl p-4 ${anyData ? 'border-border' : 'border-border/40 opacity-60'}`}>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <p className="font-mono text-sm font-semibold text-text-primary">{meeting.circuit_short_name || meeting.meeting_name}</p>
          <p className="text-[10px] text-text-tertiary font-mono">{meeting.meeting_name}</p>
        </div>
        <span className="text-[10px] text-text-tertiary font-mono">{date}</span>
      </div>
      <div>
        {meeting.sessions.map(s => (
          <SessionRow key={s.session_key} session={s} />
        ))}
      </div>
    </div>
  )
}

export function AdminPage() {
  const [year, setYear] = useState(CURRENT_YEAR)
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['sessionsStatus', year],
    queryFn: () => api.getSessionsStatus(year),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className="max-w-[1280px] mx-auto px-5 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">Session Data Status</h1>
        <div className="flex gap-1">
          {YEARS.map(y => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                y === year
                  ? 'bg-accent text-white'
                  : 'bg-bg-card border border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <p className="text-sm text-text-tertiary font-mono">Loading session data… this may take a moment.</p>
      )}
      {error && (
        <p className="text-sm text-red-400 font-mono">Failed to load status: {String(error)}</p>
      )}
      {data && (
        <>
          {isFetching && <p className="text-[10px] text-text-tertiary font-mono">Refreshing…</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.map(meeting => (
              <MeetingCard key={meeting.meeting_key} meeting={meeting} />
            ))}
          </div>
          {data.length === 0 && (
            <p className="text-sm text-text-tertiary font-mono">No sessions found for {year}.</p>
          )}
        </>
      )}
    </div>
  )
}
