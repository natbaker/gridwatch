import { useEffect } from 'react'

const SPEEDS = [1, 2, 5, 10, 20]
const SEEK_STEP = 5

interface ReplayHotkeyTarget {
  speed: number
  currentTime: number
  totalDuration: number
  isLive: boolean
  togglePlay: () => void
  seek: (t: number) => void
  setSpeed: (s: number) => void
  seekToLive: () => void
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/**
 * Window-level keyboard shortcuts for replay playback. No-op unless `enabled`.
 * Space = play/pause, ←/→ = seek ±5s, ↑/↓ = step speed, L = jump to live.
 */
export function useReplayHotkeys(replay: ReplayHotkeyTarget, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      const clamp = (t: number) => Math.max(0, Math.min(replay.totalDuration, t))
      const stepSpeed = (dir: 1 | -1) => {
        const idx = SPEEDS.indexOf(replay.speed)
        const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (idx < 0 ? 0 : idx) + dir))]
        replay.setSpeed(next)
      }
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          replay.togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          replay.seek(clamp(replay.currentTime - SEEK_STEP))
          break
        case 'ArrowRight':
          e.preventDefault()
          replay.seek(clamp(replay.currentTime + SEEK_STEP))
          break
        case 'ArrowUp':
          e.preventDefault()
          stepSpeed(1)
          break
        case 'ArrowDown':
          e.preventDefault()
          stepSpeed(-1)
          break
        case 'l':
        case 'L':
          if (replay.isLive) {
            e.preventDefault()
            replay.seekToLive()
          }
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, replay])
}
