import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api/client'
import type { TelemetrySample } from '../types'

const CHUNK_SECONDS = 30

/**
 * Fetches and buffers live telemetry for a single driver at the current replay time.
 * Mirrors the telemetry-fetching logic in useDriverFollow but without follow/radio state.
 */
export function useDriverTelemetry(
  sessionKey: number | undefined,
  driverNumber: number | null,
  dataStart: string,
  currentTime: number,
  totalDuration: number,
): TelemetrySample | null {
  const [telemetry, setTelemetry] = useState<TelemetrySample | null>(null)
  const [bufferVersion, setBufferVersion] = useState(0)
  const samplesRef = useRef<TelemetrySample[]>([])
  const bufferStartRef = useRef(0)
  const bufferEndRef = useRef(0)
  const fetchingRef = useRef(false)
  const driverRef = useRef<number | null>(null)

  const fetchChunk = useCallback(async (fromSeconds: number) => {
    if (!sessionKey || !dataStart || !driverNumber || fetchingRef.current) return
    fetchingRef.current = true
    try {
      const fromTime = new Date(new Date(dataStart).getTime() + fromSeconds * 1000).toISOString()
      const data = await api.getCarTelemetry(sessionKey, driverNumber, fromTime, CHUNK_SECONDS)
      if (driverRef.current !== driverNumber) return
      if (data.samples.length > 0) {
        const adjusted = data.samples.map(s => ({ ...s, t: s.t + fromSeconds }))
        samplesRef.current = [
          ...samplesRef.current.filter(s => s.t < fromSeconds),
          ...adjusted,
        ]
        bufferStartRef.current = fromSeconds
        bufferEndRef.current = fromSeconds + CHUNK_SECONDS
        setBufferVersion(v => v + 1)
      }
    } catch { /* ignore */ }
    fetchingRef.current = false
  }, [sessionKey, dataStart, driverNumber])

  // Reset on driver change
  useEffect(() => {
    driverRef.current = driverNumber
    samplesRef.current = []
    bufferStartRef.current = 0
    bufferEndRef.current = 0
    fetchingRef.current = false
    setTelemetry(null)
  }, [driverNumber])

  // Initial fetch when driver is set
  useEffect(() => {
    if (driverNumber && sessionKey && dataStart) {
      fetchChunk(Math.max(0, currentTime - 2))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverNumber, sessionKey, dataStart])

  // Pre-fetch next chunk
  useEffect(() => {
    if (!driverNumber) return
    if (currentTime > bufferEndRef.current - 10 && currentTime < totalDuration) {
      fetchChunk(bufferEndRef.current)
    }
  }, [currentTime, totalDuration, driverNumber, fetchChunk])

  // Refetch on seek (large jump outside buffer)
  useEffect(() => {
    if (!driverNumber) return
    if (currentTime < bufferStartRef.current || currentTime > bufferEndRef.current) {
      samplesRef.current = []
      bufferStartRef.current = 0
      bufferEndRef.current = 0
      fetchChunk(Math.max(0, currentTime - 2))
    }
  }, [currentTime, driverNumber, fetchChunk])

  // Derive current telemetry sample at replay time
  useEffect(() => {
    if (!driverNumber || samplesRef.current.length === 0) {
      setTelemetry(null)
      return
    }
    const samples = samplesRef.current
    let best: TelemetrySample | null = null
    for (let i = samples.length - 1; i >= 0; i--) {
      if (samples[i].t <= currentTime + 0.5) {
        best = samples[i]
        break
      }
    }
    setTelemetry(best)
  }, [currentTime, driverNumber, bufferVersion])

  return telemetry
}
