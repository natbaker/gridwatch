import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { LiveTimingResponse } from '../types'

export function parseTimingEvent(raw: string): LiveTimingResponse | null {
  try {
    return JSON.parse(raw) as LiveTimingResponse
  } catch {
    return null
  }
}

// Subscribes to the server-sent timing stream and writes each frame into the
// same React Query cache key that useLiveTiming reads, so every consumer gets
// pushed updates. The polling query stays as a backstop if the stream drops.
export function useLiveTimingStream(sessionKey: number | undefined, enabled: boolean) {
  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return

    const url = sessionKey
      ? `/api/live-timing/stream?session_key=${sessionKey}`
      : '/api/live-timing/stream'
    const source = new EventSource(url)

    source.onopen = () => setConnected(true)
    source.onmessage = (event) => {
      const data = parseTimingEvent(event.data)
      if (data) {
        queryClient.setQueryData(['liveTiming', sessionKey], data)
      }
    }
    source.onerror = () => setConnected(false)

    return () => source.close()
  }, [sessionKey, enabled, queryClient])

  return { connected }
}
