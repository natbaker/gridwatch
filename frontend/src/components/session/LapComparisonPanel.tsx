import { useEffect, useRef, useState } from 'react'
import { useLapTelemetry, type LapPreset } from '../../hooks/useLapTelemetry'
import { TelemetryChart } from './TelemetryChart'

interface DriverInfo { abbreviation: string; team_color: string }

interface LapComparisonPanelProps {
  compareSessionKey?: number
  driverA: number | null
  driverB: number | null
  driverInfoByNumber: Map<number, DriverInfo>
  onClearA: () => void
  onClearB: () => void
  lapPreset: LapPreset
  onSetPreset: (p: LapPreset) => void
  showPresetToggle: boolean
}

interface ImportState { status: string; progress?: string }

export function LapComparisonPanel({
  compareSessionKey, driverA, driverB, driverInfoByNumber,
  onClearA, onClearB, lapPreset, onSetPreset, showPresetToggle,
}: LapComparisonPanelProps) {
  const telemetryA = useLapTelemetry(compareSessionKey, driverA, lapPreset)
  const telemetryB = useLapTelemetry(compareSessionKey, driverB, lapPreset)

  const [importState, setImportState] = useState<ImportState | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Clean up any in-flight poll/fetch on unmount or when the session changes.
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      abortRef.current?.abort()
      pollRef.current = null
    }
  }, [compareSessionKey])

  const startImport = async () => {
    if (!compareSessionKey) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setImportState({ status: 'started', progress: 'queued' })
    try {
      const resp = await fetch(`/api/sessions/${compareSessionKey}/import-telemetry`, { method: 'POST', signal: controller.signal })
      setImportState(await resp.json())
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/sessions/${compareSessionKey}/import-status`, { signal: controller.signal })
          const s: ImportState = await r.json()
          setImportState(s)
          if (s.status === 'done' || s.status === 'error') {
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            if (s.status === 'done') {
              telemetryA.refetch()
              telemetryB.refetch()
            }
          }
        } catch {
          // aborted or transient — interval cleanup handles teardown
        }
      }, 3000)
    } catch {
      // aborted — ignore
    }
  }

  const importing = importState?.status === 'running' || importState?.status === 'started' || importState?.status === 'already_running'

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-xs tracking-[2px] text-text-secondary">LAP COMPARISON</h3>
        {driverA && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: driverInfoByNumber.get(driverA)?.team_color ?? '#fff' }} />
            <span className="text-[10px] font-mono" style={{ color: driverInfoByNumber.get(driverA)?.team_color ?? '#fff' }}>
              {driverInfoByNumber.get(driverA)?.abbreviation}
            </span>
            <button onClick={onClearA} aria-label="Remove driver A" className="text-text-tertiary hover:text-text-primary text-[9px] ml-0.5">✕</button>
          </div>
        )}
        {driverA && driverB && <span className="text-[10px] text-text-tertiary">vs</span>}
        {driverB && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: driverInfoByNumber.get(driverB)?.team_color ?? '#fff' }} />
            <span className="text-[10px] font-mono" style={{ color: driverInfoByNumber.get(driverB)?.team_color ?? '#fff' }}>
              {driverInfoByNumber.get(driverB)?.abbreviation}
            </span>
            <button onClick={onClearB} aria-label="Remove driver B" className="text-text-tertiary hover:text-text-primary text-[9px] ml-0.5">✕</button>
          </div>
        )}
        {(driverA && !driverB) || (!driverA && driverB) ? (
          <span className="text-[10px] text-text-tertiary">Pick one more driver to compare</span>
        ) : null}
        {showPresetToggle && (driverA || driverB) && (
          <div className="flex bg-bg-elevated rounded border border-border overflow-hidden ml-auto">
            {(['fastest', 'last', 'first'] as LapPreset[]).map(p => (
              <button
                key={p}
                onClick={() => onSetPreset(p)}
                aria-pressed={lapPreset === p}
                className={`px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider transition-colors ${
                  lapPreset === p ? 'bg-accent/20 text-accent' : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {driverA && driverB && (
        <>
          {(telemetryA.isLoading || telemetryB.isLoading) && (
            <div className="flex items-center justify-center py-8">
              <span className="text-[10px] text-text-tertiary font-mono animate-pulse">LOADING TELEMETRY...</span>
            </div>
          )}
          {telemetryA.error && telemetryB.error && (
            <div className="flex flex-col items-center gap-3 py-6">
              <span className="text-[10px] text-text-tertiary font-mono">Session data not available for lap comparison</span>
              {compareSessionKey && (
                importing ? (
                  <span className="text-[10px] text-accent font-mono animate-pulse">
                    IMPORTING... {importState?.progress ?? ''}
                  </span>
                ) : importState?.status === 'done' ? (
                  <span className="text-[10px] text-green-400 font-mono">Import complete — select drivers again to load</span>
                ) : (
                  <button
                    onClick={startImport}
                    className="text-[10px] text-accent hover:text-accent/80 font-mono font-medium"
                  >
                    IMPORT TELEMETRY ▶
                  </button>
                )
              )}
            </div>
          )}
          {!telemetryA.isLoading && !telemetryB.isLoading && (
            <TelemetryChart
              driverA={telemetryA.data ? {
                data: telemetryA.data,
                color: driverInfoByNumber.get(driverA)?.team_color ?? '#fff',
                abbreviation: driverInfoByNumber.get(driverA)?.abbreviation ?? '?',
              } : null}
              driverB={telemetryB.data ? {
                data: telemetryB.data,
                color: driverInfoByNumber.get(driverB)?.team_color ?? '#fff',
                abbreviation: driverInfoByNumber.get(driverB)?.abbreviation ?? '?',
              } : null}
            />
          )}
        </>
      )}
    </div>
  )
}
