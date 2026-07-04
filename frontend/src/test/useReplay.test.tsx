import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useReplay } from '../hooks/useReplay'
import { api } from '../api/client'

vi.mock('../api/client', () => ({
  api: {
    getReplayInfo: vi.fn(),
    getReplayPositions: vi.fn().mockResolvedValue({ positions: [] }),
  },
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useReplay totalDuration', () => {
  it('extends past the last-lap cap to cover post-race radio clips', async () => {
    // Real-world case (Monaco GP 2026, session 11291-style): the session's
    // scheduled data_end (2h) undershoots the actual race, and team radio
    // keeps recording well after the last lap.
    vi.mocked(api.getReplayInfo).mockResolvedValue({
      data_start: '2026-05-24T20:00:00Z',
      data_end: '2026-05-24T22:00:00Z', // 7200s window
      is_live: false,
      lap_events: [{ t: 5809.8, lap: 68 }],
      radio_events: [
        { t: 5991.1, n: 12, url: 'a.mp3' },
        { t: 6299.3, n: 43, url: 'b.mp3' },
      ],
      drivers: {},
    } as never)

    const { result } = renderHook(() => useReplay(11291), { wrapper })

    await waitFor(() => expect(result.current.totalDuration).toBeGreaterThan(0))

    // Every radio clip must fall within the playable timeline.
    for (const r of result.current.radioEvents) {
      expect(r.t).toBeLessThanOrEqual(result.current.totalDuration)
    }
  })

  it('never truncates before the last lap, even if data_end undershoots it', async () => {
    vi.mocked(api.getReplayInfo).mockResolvedValue({
      data_start: '2026-06-07T13:00:00Z',
      data_end: '2026-06-07T15:00:00Z', // 7200s window, shorter than the race
      is_live: false,
      lap_events: [{ t: 8728.2, lap: 78 }],
      radio_events: [],
      drivers: {},
    } as never)

    const { result } = renderHook(() => useReplay(11299), { wrapper })

    await waitFor(() => expect(result.current.totalDuration).toBeGreaterThan(0))
    expect(result.current.totalDuration).toBeGreaterThanOrEqual(8728.2)
  })
})
