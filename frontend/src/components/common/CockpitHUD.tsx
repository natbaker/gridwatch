import type { TelemetrySample } from '../../types'

interface CockpitHUDProps {
  abbreviation: string
  teamColor: string
  telemetry: TelemetrySample | null
  isRadioPlaying: boolean
  radioMuted: boolean
  onToggleMute: () => void
  onClose: () => void
  compact?: boolean
  label?: string
}

/** SVG arc tachometer that curves over the center gauges */
function RpmArc({ rpm }: { rpm: number }) {
  const pct = Math.min(1, rpm / 15000)
  const R = 58
  const cx = 70
  const cy = 62

  // Full semicircle path from left to right over the top
  const x1 = cx - R  // left
  const x2 = cx + R  // right
  const arcPath = `M ${x1} ${cy} A ${R} ${R} 0 0 1 ${x2} ${cy}`

  // Use stroke-dasharray to control fill: total length of semicircle = π * R
  const totalLen = Math.PI * R
  const fillLen = totalLen * pct

  const color = rpm > 12000 ? '#EF4444' : rpm > 10000 ? '#F59E0B' : '#3B82F6'

  // Tick marks at 5k, 10k, 12k, 15k
  const ticks = [5000, 10000, 12000, 15000].map(v => {
    const t = Math.min(1, v / 15000)
    const a = Math.PI * (1 - t)
    const inner = R - 3
    const outer = R + 3
    return {
      x1: cx + inner * Math.cos(a),
      y1: cy - inner * Math.sin(a),
      x2: cx + outer * Math.cos(a),
      y2: cy - outer * Math.sin(a),
      v,
    }
  })

  return (
    <svg width="140" height="68" viewBox="0 0 140 68" className="absolute top-0 left-1/2 -translate-x-1/2 -mt-1">
      {/* Background arc */}
      <path d={arcPath} fill="none" stroke="white" strokeWidth={4} opacity={0.08} strokeLinecap="round" />
      {/* Value arc via dasharray */}
      {pct > 0.005 && (
        <path
          d={arcPath}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${fillLen} ${totalLen}`}
          style={{ transition: 'stroke-dasharray 0.1s, stroke 0.15s' }}
        />
      )}
      {/* Tick marks */}
      {ticks.map(t => (
        <line
          key={t.v}
          x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
          stroke="white"
          strokeWidth={1}
          opacity={0.2}
        />
      ))}
      {/* RPM label */}
      <text x={cx} y={14} textAnchor="middle" fill="white" fontSize="8" fontFamily="monospace" opacity={0.3}>
        RPM
      </text>
      <text x={cx} y={23} textAnchor="middle" fill={rpm > 0 ? color : '#666'} fontSize="9" fontFamily="monospace" fontWeight="bold">
        {rpm > 0 ? Math.round(rpm).toLocaleString() : '—'}
      </text>
    </svg>
  )
}

export function CockpitHUD({
  abbreviation,
  teamColor,
  telemetry,
  isRadioPlaying,
  radioMuted,
  onToggleMute,
  onClose,
  compact,
  label,
}: CockpitHUDProps) {
  const spd = telemetry?.spd ?? 0
  const gear = telemetry?.gear ?? 0
  const rpm = telemetry?.rpm ?? 0
  const thr = telemetry?.thr ?? 0
  const brk = telemetry?.brk ?? 0
  const drsOpen = (telemetry?.drs ?? 0) >= 10

  const thrPct = Math.min(100, Math.max(0, thr))
  const brkPct = Math.min(100, Math.max(0, brk))

  return (
    <div className="bg-black/85 backdrop-blur-sm rounded-lg px-4 py-3 flex items-end gap-0">
      {/* Left: Driver badge + Throttle */}
      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        <div className="flex items-center gap-1.5">
          <div className="w-1 h-4 rounded-full" style={{ backgroundColor: teamColor }} />
          <span className="font-mono font-bold text-xs" style={{ color: teamColor }}>{abbreviation}</span>
          <span className="text-[8px] text-text-tertiary uppercase tracking-widest ml-1">{label ?? 'FOLLOWING'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-mono text-green-400/80 w-6 text-right">{thrPct > 0 ? `${Math.round(thrPct)}%` : ''}</span>
          <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-75"
              style={{ width: `${thrPct}%`, background: 'linear-gradient(90deg, #166534, #22C55E)' }}
            />
          </div>
          <span className="text-[8px] font-mono text-green-400/60 w-6">THR</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-mono text-red-400/80 w-6 text-right">{brkPct > 0 ? `${Math.round(brkPct)}%` : ''}</span>
          <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-75"
              style={{ width: `${brkPct}%`, background: 'linear-gradient(90deg, #991B1B, #EF4444)' }}
            />
          </div>
          <span className="text-[8px] font-mono text-red-400/60 w-6">BRK</span>
        </div>
      </div>

      {/* Center: Speed + Gear + DRS with RPM arc over top */}
      <div className="relative flex flex-col items-center px-6" style={{ width: compact ? 140 : 180 }}>
        <RpmArc rpm={rpm} />
        <div className="flex items-baseline gap-3 mt-6">
          <div className="flex flex-col items-center">
            <span className="text-4xl font-bold font-mono text-white tabular-nums leading-none">
              {spd}
            </span>
            <span className="text-[7px] text-text-tertiary uppercase tracking-widest mt-0.5">km/h</span>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          <div className="flex flex-col items-center">
            <span className="text-xl font-bold font-mono text-white leading-none">{gear === 0 ? 'N' : gear}</span>
            <span className="text-[7px] text-text-tertiary uppercase tracking-wider">GEAR</span>
          </div>
          <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded ${drsOpen ? 'bg-green-500 text-black' : 'bg-white/8 text-text-tertiary'}`}>
            DRS
          </span>
        </div>
      </div>

      {/* Right: Radio + Close */}
      <div className="flex-1 flex flex-col items-end gap-2 min-w-0">
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-white/10 transition-colors text-[10px]"
        >
          ✕
        </button>
        {!compact && (
          <button
            onClick={onToggleMute}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-mono transition-colors ${
              radioMuted ? 'bg-white/5 text-text-tertiary' : 'bg-white/10 text-text-secondary'
            }`}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              {radioMuted ? (
                <path d="M23 9l-6 6M17 9l6 6" />
              ) : (
                <path d="M15.54 8.46a5 5 0 010 7.07" />
              )}
            </svg>
            RADIO {radioMuted ? 'OFF' : 'ON'}
            {isRadioPlaying && !radioMuted && (
              <div className="flex items-center gap-px ml-0.5">
                {[1,2,3].map(i => (
                  <div
                    key={i}
                    className="w-px bg-green-400 rounded-full animate-pulse"
                    style={{ height: `${4 + Math.random() * 4}px`, animationDelay: `${i * 0.1}s` }}
                  />
                ))}
              </div>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
