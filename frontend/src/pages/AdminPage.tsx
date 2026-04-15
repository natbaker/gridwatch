import { useState, useEffect, useCallback } from 'react'

interface AvailableSession {
  session_key: number
  circuit: string
  country: string
  session_name: string
  date_start: string
  year: number
  downloaded: boolean
}

interface DownloadedSession {
  session_key: number
  circuit: string
  session_name: string
  data_start: string
  downloaded_at: string
  car_data: number
  locations: number
  radio: number
}

interface DownloadStatus {
  status: 'idle' | 'queued' | 'starting' | 'downloading' | 'done' | 'error'
  message: string
  percent: number
}

function formatNumber(n: number): string {
  return n.toLocaleString()
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    })
  } catch {
    return iso
  }
}

const YEARS = [2025, 2024, 2023]

export function AdminPage() {
  const [token, setToken] = useState(() => localStorage.getItem('admin_token') ?? '')
  const [tokenInput, setTokenInput] = useState('')
  const [available, setAvailable] = useState<AvailableSession[]>([])
  const [downloaded, setDownloaded] = useState<DownloadedSession[]>([])
  const [loadingAvailable, setLoadingAvailable] = useState(true)
  const [loadingDownloaded, setLoadingDownloaded] = useState(true)
  const [year, setYear] = useState(2024)
  const [statuses, setStatuses] = useState<Record<number, DownloadStatus>>({})
  const [deleting, setDeleting] = useState<number | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const adminFetch = useCallback((url: string, init?: RequestInit) => {
    return fetch(url, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${token}` },
    })
  }, [token])

  const saveToken = () => {
    localStorage.setItem('admin_token', tokenInput)
    setToken(tokenInput)
    setTokenInput('')
  }

  const fetchDownloaded = useCallback(async () => {
    try {
      const resp = await adminFetch('/api/admin/sessions')
      const data = await resp.json()
      setDownloaded(data.sessions ?? [])
    } catch { /* ignore */ }
    setLoadingDownloaded(false)
  }, [adminFetch])

  const fetchAvailable = useCallback(async (y: number) => {
    setLoadingAvailable(true)
    try {
      const resp = await adminFetch(`/api/admin/available-sessions?year=${y}`)
      const data = await resp.json()
      setAvailable(data.sessions ?? [])
    } catch { /* ignore */ }
    setLoadingAvailable(false)
  }, [adminFetch])

  useEffect(() => { fetchDownloaded() }, [fetchDownloaded])
  useEffect(() => { fetchAvailable(year) }, [year, fetchAvailable])

  // Track which session_keys need polling
  const activeKeys = Object.entries(statuses)
    .filter(([, s]) => s.status === 'queued' || s.status === 'starting' || s.status === 'downloading')
    .map(([k]) => Number(k))

  // Poll all active/queued downloads
  useEffect(() => {
    if (activeKeys.length === 0) return
    const interval = setInterval(async () => {
      for (const sk of activeKeys) {
        try {
          const resp = await adminFetch(`/api/admin/download-status?session_key=${sk}`)
          const status: DownloadStatus = await resp.json()
          setStatuses(prev => ({ ...prev, [sk]: status }))
          if (status.status === 'done' || status.status === 'error') {
            fetchDownloaded()
            fetchAvailable(year)
          }
        } catch { /* ignore */ }
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [activeKeys.join(','), fetchDownloaded, fetchAvailable, year, adminFetch])

  const startDownload = async (sessionKey: number) => {
    setStatuses(prev => ({ ...prev, [sessionKey]: { status: 'queued', message: 'Queued', percent: 0 } }))
    try {
      const resp = await adminFetch(`/api/admin/download?session_key=${sessionKey}`, { method: 'POST' })
      if (!resp.ok) {
        const err = await resp.json()
        setStatuses(prev => ({ ...prev, [sessionKey]: { status: 'error', message: err.error ?? 'Failed', percent: 0 } }))
      }
    } catch (e) {
      setStatuses(prev => ({ ...prev, [sessionKey]: { status: 'error', message: String(e), percent: 0 } }))
    }
  }

  const deleteSession = async (key: number) => {
    setDeleting(key)
    try {
      await adminFetch(`/api/admin/sessions?session_key=${key}`, { method: 'DELETE' })
      fetchDownloaded()
      fetchAvailable(year)
    } catch { /* ignore */ }
    setDeleting(null)
  }

  // Find the currently active download for the progress bar
  const activeEntry = Object.entries(statuses).find(
    ([, s]) => s.status === 'starting' || s.status === 'downloading'
  )
  const queuedKeys = Object.entries(statuses)
    .filter(([, s]) => s.status === 'queued')
    .map(([k]) => Number(k))

  return (
    <div className="max-w-[960px] mx-auto px-5 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Session Data Manager</h1>
          <p className="text-sm text-text-secondary mt-1">
            Download OpenF1 telemetry, positions, and radio for offline replay
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {token ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-400 font-mono">token set</span>
              <button
                onClick={() => { localStorage.removeItem('admin_token'); setToken('') }}
                className="text-xs text-text-tertiary hover:text-red-400 transition-colors"
              >
                clear
              </button>
            </div>
          ) : (
            <form onSubmit={e => { e.preventDefault(); saveToken() }} className="flex items-center gap-2">
              <input
                type="password"
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="Admin token"
                className="text-xs bg-bg-elevated border border-border-primary rounded-md px-3 py-1.5 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent w-36"
              />
              <button
                type="submit"
                disabled={!tokenInput}
                className="text-xs font-semibold px-3 py-1.5 rounded-md bg-accent hover:bg-accent/80 text-black disabled:opacity-40 transition-colors"
              >
                Save
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Download progress (shown when active or queued) */}
      {(activeEntry || queuedKeys.length > 0) && (
        <div className="bg-bg-card border border-border-primary rounded-xl p-4 space-y-2">
          {activeEntry && (() => {
            const [sk, status] = activeEntry
            return (
              <>
                <div className="flex justify-between text-xs">
                  <span className="text-text-secondary">
                    Session {sk}: {status.message}
                  </span>
                  {status.percent > 0 && (
                    <span className="text-text-tertiary font-mono">{status.percent}%</span>
                  )}
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 bg-accent"
                    style={{ width: `${status.percent}%` }}
                  />
                </div>
              </>
            )
          })()}
          {queuedKeys.length > 0 && (
            <div className="text-[10px] text-text-tertiary font-mono">
              Queued: {queuedKeys.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Available races */}
      <div className="bg-bg-card border border-border-primary rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border-primary flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Available Sessions</h2>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {['all', 'Race', 'Qualifying', 'Practice'].map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-2 py-1 text-[10px] font-mono rounded-md transition-colors ${
                    t === typeFilter
                      ? 'bg-white/10 text-text-primary font-bold'
                      : 'text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  {t === 'all' ? 'ALL' : t.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="w-px h-4 bg-border-primary" />
            <div className="flex gap-1">
            {YEARS.map(y => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`px-3 py-1 text-xs font-mono rounded-md transition-colors ${
                  y === year
                    ? 'bg-accent text-black font-bold'
                    : 'bg-white/5 text-text-secondary hover:bg-white/10'
                }`}
              >
                {y}
              </button>
            ))}
            </div>
          </div>
        </div>

        {loadingAvailable ? (
          <div className="p-8 text-center text-text-tertiary text-sm">Loading sessions...</div>
        ) : available.length === 0 ? (
          <div className="p-8 text-center text-text-tertiary text-sm">No sessions found for {year}</div>
        ) : (
          <div className="divide-y divide-border-primary">
            {available.filter(s => typeFilter === 'all' || s.session_name.includes(typeFilter)).map(s => {
              const st = statuses[s.session_key]
              const isBusy = st && (st.status === 'queued' || st.status === 'starting' || st.status === 'downloading')
              return (
                <div key={s.session_key} className="px-5 py-3 flex items-center gap-4 hover:bg-white/[0.02] transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{s.circuit}</span>
                      <span className="text-xs text-text-tertiary">{s.country}</span>
                      <span className="text-[10px] font-mono text-text-tertiary bg-white/5 px-1.5 py-0.5 rounded">{s.session_name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-text-tertiary">
                      <span>{formatDate(s.date_start)}</span>
                      <span className="font-mono text-[10px] bg-white/5 px-1.5 py-0.5 rounded">{s.session_key}</span>
                    </div>
                  </div>
                  {s.downloaded ? (
                    <span className="text-xs text-green-400 font-mono px-2 py-1 bg-green-400/10 rounded">Downloaded</span>
                  ) : isBusy ? (
                    <span className="text-xs text-accent font-mono px-2 py-1 bg-accent/10 rounded">
                      {st.status === 'queued' ? 'Queued' : 'Downloading...'}
                    </span>
                  ) : (
                    <button
                      onClick={() => startDownload(s.session_key)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-md transition-colors bg-accent hover:bg-accent/80 text-black"
                    >
                      Download
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Downloaded sessions */}
      <div className="bg-bg-card border border-border-primary rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border-primary">
          <h2 className="font-display text-lg font-semibold">Downloaded Sessions</h2>
        </div>

        {loadingDownloaded ? (
          <div className="p-8 text-center text-text-tertiary text-sm">Loading...</div>
        ) : downloaded.length === 0 ? (
          <div className="p-8 text-center text-text-tertiary text-sm">
            No sessions downloaded yet. Pick a session above to get started.
          </div>
        ) : (
          <div className="divide-y divide-border-primary">
            {downloaded.map(s => (
              <div key={s.session_key} className="px-5 py-3.5 flex items-center gap-4 hover:bg-white/[0.02] transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{s.circuit}</span>
                    <span className="text-xs text-text-tertiary">{s.session_name}</span>
                    <span className="text-[10px] font-mono text-text-tertiary bg-white/5 px-1.5 py-0.5 rounded">
                      {s.session_key}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-text-tertiary">
                    <span>{formatDate(s.data_start)}</span>
                    <span className="text-text-tertiary/50">|</span>
                    <span>{formatNumber(s.car_data)} telemetry</span>
                    <span className="text-text-tertiary/50">|</span>
                    <span>{formatNumber(s.locations)} positions</span>
                    <span className="text-text-tertiary/50">|</span>
                    <span>{s.radio} radio</span>
                  </div>
                </div>
                <button
                  onClick={() => deleteSession(s.session_key)}
                  disabled={deleting === s.session_key}
                  className="text-xs text-text-tertiary hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-400/10 disabled:opacity-50"
                >
                  {deleting === s.session_key ? '...' : 'Delete'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
