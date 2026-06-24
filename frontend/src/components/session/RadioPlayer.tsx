interface Props {
  radioOn: boolean
  onToggle: () => void
  nowPlaying: number | null
  driverMeta?: Record<string, { abbreviation: string; team_color: string }>
  followedDriver?: number | null
}

// Single radio on/off control. Playback itself is driven by useRadio: while on,
// it plays the followed driver's radio, or every driver's when none is followed.
export function RadioPlayer({ radioOn, onToggle, nowPlaying, driverMeta, followedDriver }: Props) {
  const meta = nowPlaying != null ? driverMeta?.[String(nowPlaying)] : undefined
  const scope = followedDriver != null ? 'followed driver' : 'all drivers'

  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono border transition-colors ${
        radioOn
          ? 'bg-accent/20 text-accent border-accent/30'
          : 'bg-bg-elevated text-text-tertiary border-border hover:text-text-primary'
      }`}
      title={`Team radio — plays ${scope} as the replay reaches each clip`}
    >
      {radioOn ? '📻 RADIO ON' : '📻 RADIO OFF'}
      {radioOn && meta && (
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: meta.team_color }} />
          <span style={{ color: meta.team_color }}>{meta.abbreviation}</span>
        </span>
      )}
    </button>
  )
}
