interface ReplayControlsProps {
  isPlaying: boolean
  speed: number
  currentTime: number
  totalDuration: number
  onTogglePlay: () => void
  onSetSpeed: (speed: number) => void
  onSeek: (time: number) => void
  lapTimes?: { t: number; lap: number }[]
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

const SPEEDS = [1, 2, 5, 10, 20]

export function ReplayControls({
  isPlaying,
  speed,
  currentTime,
  totalDuration,
  onTogglePlay,
  onSetSpeed,
  onSeek,
  lapTimes,
}: ReplayControlsProps) {
  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0

  return (
    <div className="flex items-center gap-3 bg-bg-elevated rounded-lg px-3 py-2">
      <button
        onClick={onTogglePlay}
        disabled={totalDuration === 0}
        className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors flex-shrink-0 ${
          totalDuration === 0
            ? 'bg-text-tertiary/30 text-text-tertiary cursor-not-allowed'
            : 'bg-accent text-white hover:bg-accent/80'
        }`}
      >
        {isPlaying ? (
          <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
            <rect x="0" y="0" width="4" height="14" rx="1" />
            <rect x="8" y="0" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
            <path d="M0 0 L12 7 L0 14 Z" />
          </svg>
        )}
      </button>

      <span className="text-[11px] font-mono text-text-secondary w-12 text-right flex-shrink-0">
        {formatTime(currentTime)}
      </span>

      <div
        className="flex-1 h-6 flex items-center cursor-pointer group"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
          onSeek(pct * totalDuration)
        }}
      >
        <div className="w-full h-1.5 bg-border rounded-full relative">
          {lapTimes?.map(({ t, lap }) => {
            const pct = totalDuration > 0 ? (t / totalDuration) * 100 : 0
            const isMajor = lap % 5 === 0
            return (
              <div
                key={lap}
                className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center cursor-pointer"
                style={{ left: `${pct}%` }}
                onClick={(e) => { e.stopPropagation(); onSeek(t) }}
                title={`Lap ${lap}`}
              >
                <div className={`w-px ${isMajor ? 'h-3 bg-text-tertiary/60' : 'h-2 bg-text-tertiary/30'}`} />
                {isMajor && (
                  <span className="text-[7px] font-mono text-text-tertiary/60 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {lap}
                  </span>
                )}
              </div>
            )
          })}
          <div
            className="h-full bg-accent rounded-full transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-accent rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `${progress}%`, marginLeft: -6 }}
          />
        </div>
      </div>

      <span className="text-[11px] font-mono text-text-tertiary w-12 flex-shrink-0">
        {formatTime(totalDuration)}
      </span>

      <div className="flex gap-1 flex-shrink-0">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => onSetSpeed(s)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
              speed === s
                ? 'bg-accent text-white'
                : 'text-text-tertiary hover:text-text-primary hover:bg-bg-card'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  )
}
