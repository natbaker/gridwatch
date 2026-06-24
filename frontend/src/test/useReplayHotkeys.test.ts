import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useReplayHotkeys } from '../hooks/useReplayHotkeys'

function makeReplay(overrides: Partial<Parameters<typeof useReplayHotkeys>[0]> = {}) {
  return {
    speed: 1,
    currentTime: 100,
    totalDuration: 3600,
    isLive: false,
    togglePlay: vi.fn(),
    seek: vi.fn(),
    setSpeed: vi.fn(),
    seekToLive: vi.fn(),
    ...overrides,
  }
}

function press(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }))
}

describe('useReplayHotkeys', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does nothing when disabled', () => {
    const replay = makeReplay()
    renderHook(() => useReplayHotkeys(replay, false))
    press(' ')
    expect(replay.togglePlay).not.toHaveBeenCalled()
  })

  it('toggles play on Space', () => {
    const replay = makeReplay()
    renderHook(() => useReplayHotkeys(replay, true))
    press(' ')
    expect(replay.togglePlay).toHaveBeenCalledOnce()
  })

  it('seeks with arrow keys', () => {
    const replay = makeReplay()
    renderHook(() => useReplayHotkeys(replay, true))
    press('ArrowRight')
    expect(replay.seek).toHaveBeenLastCalledWith(105)
    press('ArrowLeft')
    expect(replay.seek).toHaveBeenLastCalledWith(95)
  })

  it('steps speed up and down through presets', () => {
    const replay = makeReplay({ speed: 2 })
    renderHook(() => useReplayHotkeys(replay, true))
    press('ArrowUp')
    expect(replay.setSpeed).toHaveBeenLastCalledWith(5)
    press('ArrowDown')
    expect(replay.setSpeed).toHaveBeenLastCalledWith(1)
  })

  it('jumps to live with L only when live', () => {
    const replay = makeReplay({ isLive: false })
    const { rerender } = renderHook(({ live }) => useReplayHotkeys(makeReplayLive(replay, live), true), {
      initialProps: { live: false },
    })
    press('l')
    expect(replay.seekToLive).not.toHaveBeenCalled()
    rerender({ live: true })
    press('l')
    expect(replay.seekToLive).toHaveBeenCalledOnce()
  })

  it('removes the listener on unmount', () => {
    const replay = makeReplay()
    const { unmount } = renderHook(() => useReplayHotkeys(replay, true))
    unmount()
    press(' ')
    expect(replay.togglePlay).not.toHaveBeenCalled()
  })
})

// keep seekToLive mock stable across rerenders while flipping isLive
function makeReplayLive(base: ReturnType<typeof makeReplay>, live: boolean) {
  return { ...base, isLive: live }
}
