import { useEffect, useMemo, useRef, useState } from 'react'

interface RadioEvent {
  t: number
  n: number
  url: string
}

interface Props {
  radioEvents: RadioEvent[]
  driverMeta?: Record<string, { abbreviation: string; team_color: string }>
  currentTime: number
}

// A toggle that, while armed, plays any team-radio clip as the replay playhead
// reaches its timestamp (any driver). It does not loop through all clips — it
// follows the timeline.
export function RadioPlayer({ radioEvents, driverMeta, currentTime }: Props) {
  const [armed, setArmed] = useState(false)
  const [nowPlaying, setNowPlaying] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lastTimeRef = useRef(currentTime)
  const sorted = useMemo(() => [...radioEvents].sort((a, b) => a.t - b.t), [radioEvents])

  // Play clips whose timestamp the playhead crosses while armed.
  useEffect(() => {
    const prev = lastTimeRef.current
    lastTimeRef.current = currentTime
    if (!armed) return
    // Only react to forward progress; ignore pauses and backward seeks.
    if (currentTime <= prev) return
    const crossed = sorted.filter(e => e.t > prev && e.t <= currentTime)
    if (crossed.length === 0) return
    // Don't interrupt a clip that's still playing.
    if (audioRef.current && !audioRef.current.paused && !audioRef.current.ended) return
    const clip = crossed[crossed.length - 1]
    const audio = new Audio(clip.url)
    audioRef.current = audio
    setNowPlaying(clip.n)
    audio.onended = () => setNowPlaying(null)
    audio.onerror = () => setNowPlaying(null)
    audio.play().catch(() => setNowPlaying(null))
  }, [currentTime, armed, sorted])

  // Stop audio when disarmed.
  useEffect(() => {
    if (!armed) {
      audioRef.current?.pause()
      audioRef.current = null
      setNowPlaying(null)
    }
  }, [armed])

  // Clean up on unmount.
  useEffect(() => () => { audioRef.current?.pause() }, [])

  if (sorted.length === 0) return null

  const meta = nowPlaying != null ? driverMeta?.[String(nowPlaying)] : undefined

  return (
    <button
      onClick={() => setArmed(a => !a)}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono border transition-colors ${
        armed
          ? 'bg-accent/20 text-accent border-accent/30'
          : 'bg-bg-elevated text-text-tertiary border-border hover:text-text-primary'
      }`}
      title="Play team radio as the replay reaches each clip"
    >
      {armed ? '📻 RADIO ON' : '📻 RADIO OFF'}
      {meta && (
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: meta.team_color }} />
          <span style={{ color: meta.team_color }}>{meta.abbreviation}</span>
        </span>
      )}
    </button>
  )
}
