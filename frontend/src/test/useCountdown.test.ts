import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCountdown } from '../hooks/useCountdown'

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns isExpired=true and zeros when targetUtc is null', () => {
    const { result } = renderHook(() => useCountdown(null))
    expect(result.current.isExpired).toBe(true)
    expect(result.current.days).toBe(0)
    expect(result.current.hours).toBe(0)
    expect(result.current.minutes).toBe(0)
    expect(result.current.seconds).toBe(0)
  })

  it('returns isExpired=true and zeros when target is in the past', () => {
    vi.setSystemTime(new Date('2026-05-25T14:00:00Z'))
    const { result } = renderHook(() => useCountdown('2026-05-25T13:00:00Z'))
    expect(result.current.isExpired).toBe(true)
    expect(result.current.seconds).toBe(0)
  })

  it('returns correct days/hours/minutes/seconds for a future target', () => {
    const now = new Date('2026-05-25T00:00:00Z')
    vi.setSystemTime(now)
    // 1 day, 2 hours, 3 minutes, 4 seconds in the future
    const target = new Date(now.getTime() + (1 * 86400 + 2 * 3600 + 3 * 60 + 4) * 1000).toISOString()

    const { result } = renderHook(() => useCountdown(target))

    expect(result.current.isExpired).toBe(false)
    expect(result.current.days).toBe(1)
    expect(result.current.hours).toBe(2)
    expect(result.current.minutes).toBe(3)
    expect(result.current.seconds).toBe(4)
  })

  it('ticks down by 1 second after 1000ms', () => {
    const now = new Date('2026-05-25T00:00:00Z')
    vi.setSystemTime(now)
    const target = new Date(now.getTime() + 65000).toISOString() // 1m 5s

    const { result } = renderHook(() => useCountdown(target))
    expect(result.current.seconds).toBe(5)

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(result.current.seconds).toBe(4)
  })

  it('transitions to isExpired when countdown reaches zero', () => {
    const now = new Date('2026-05-25T00:00:00Z')
    vi.setSystemTime(now)
    const target = new Date(now.getTime() + 1000).toISOString() // 1 second

    const { result } = renderHook(() => useCountdown(target))
    expect(result.current.isExpired).toBe(false)

    act(() => {
      vi.advanceTimersByTime(1500)
    })

    expect(result.current.isExpired).toBe(true)
  })
})
