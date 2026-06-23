import { useEffect, useMemo, useRef, useState } from 'react'

interface RadioEvent {
  t: number
  n: number
  url: string
}

interface Props {
  radioEvents: RadioEvent[]
  driverMeta?: Record<string, { abbreviation: string; team_color: string }>
}

// Plays every team-radio clip in the session in chronological order, advancing
// automatically when each clip ends (or fails to load).
export function RadioPlayer({ radioEvents, driverMeta }: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const sorted = useMemo(() => [...radioEvents].sort((a, b) => a.t - b.t), [radioEvents])

  const stop = () => {
    audioRef.current?.pause()
    audioRef.current = null
    setActiveIdx(null)
  }

  // Clean up any playing audio on unmount.
  useEffect(() => () => { audioRef.current?.pause() }, [])

  const playFrom = (i: number) => {
    if (i >= sorted.length) { stop(); return }
    audioRef.current?.pause()
    const audio = new Audio(sorted[i].url)
    audioRef.current = audio
    audio.onended = () => playFrom(i + 1)
    audio.onerror = () => playFrom(i + 1)
    setActiveIdx(i)
    audio.play().catch(() => playFrom(i + 1))
  }

  if (sorted.length === 0) return null

  const playing = activeIdx !== null
  const activeMeta = playing ? driverMeta?.[String(sorted[activeIdx!].n)] : undefined

  return (
    <button
      onClick={() => (playing ? stop() : playFrom(0))}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono bg-bg-elevated border border-border text-text-tertiary hover:text-text-primary transition-colors"
      title={`${sorted.length} team-radio clips`}
    >
      {playing ? '■ STOP' : '📻 PLAY ALL RADIO'}
      {playing && activeMeta && (
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activeMeta.team_color }} />
          <span style={{ color: activeMeta.team_color }}>{activeMeta.abbreviation}</span>
          <span className="text-text-tertiary">{(activeIdx ?? 0) + 1}/{sorted.length}</span>
        </span>
      )}
    </button>
  )
}
