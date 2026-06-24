import { useCallback, useEffect, useRef, useState } from 'react'

export interface RadioEvent {
  t: number
  n: number
  url: string
}

export interface RadioState {
  radioOn: boolean
  setRadioOn: (on: boolean) => void
  nowPlaying: number | null
  playClip: (clip: RadioEvent) => void
}

// Single radio engine for the session. While on, it plays team radio as the
// replay playhead reaches each clip:
//   - a driver is followed  → only that driver's radio
//   - no driver followed    → every driver's radio
// Clips are serialised (one at a time); clicking a timeline dot can also play a
// specific clip immediately via playClip().
export function useRadio(
  currentTime: number,
  followedDriver: number | null,
  radioEvents: RadioEvent[],
): RadioState {
  const [radioOn, setRadioOn] = useState(false)
  const [nowPlaying, setNowPlaying] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playedRef = useRef<Set<string>>(new Set())
  const lastTimeRef = useRef(currentTime)

  const stop = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
    setNowPlaying(null)
  }, [])

  const playClip = useCallback((clip: RadioEvent) => {
    audioRef.current?.pause()
    const audio = new Audio(clip.url)
    audioRef.current = audio
    playedRef.current.add(`${clip.n}-${clip.t}`)
    setNowPlaying(clip.n)
    const clear = () => {
      if (audioRef.current === audio) {
        audioRef.current = null
        setNowPlaying(null)
      }
    }
    audio.onended = clear
    audio.onerror = clear
    audio.play().catch(clear)
  }, [])

  // Stop audio when the radio is switched off.
  useEffect(() => {
    if (!radioOn) stop()
  }, [radioOn, stop])

  // Clean up on unmount.
  useEffect(() => () => { audioRef.current?.pause() }, [])

  // Auto-play clips as the playhead crosses them.
  useEffect(() => {
    const prev = lastTimeRef.current
    lastTimeRef.current = currentTime
    if (!radioOn) return
    if (currentTime < prev) {
      // Backward seek — allow those clips to play again later.
      playedRef.current = new Set()
      return
    }
    if (currentTime === prev) return
    // Don't interrupt a clip that's still playing.
    if (audioRef.current && !audioRef.current.paused && !audioRef.current.ended) return
    const candidates = radioEvents
      .filter(r => followedDriver == null || r.n === followedDriver)
      .filter(r => r.t > prev && r.t <= currentTime && !playedRef.current.has(`${r.n}-${r.t}`))
      .sort((a, b) => a.t - b.t)
    if (candidates.length === 0) return
    playClip(candidates[candidates.length - 1])
  }, [currentTime, radioOn, followedDriver, radioEvents, playClip])

  return { radioOn, setRadioOn, nowPlaying, playClip }
}
