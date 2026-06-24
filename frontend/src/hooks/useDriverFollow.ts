import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api/client'
import type { TelemetrySample } from '../types'

const CHUNK_SECONDS = 30

export interface DriverFollowState {
  followedDriver: number | null
  followDriver: (driverNumber: number | null) => void
  selectDriver: (driverNumber: number) => void
  telemetry: TelemetrySample | null
}

export function useDriverFollow(
  sessionKey: number | undefined,
  dataStart: string,
  currentTime: number,
  totalDuration: number,
): DriverFollowState {
  const [followedDriver, setFollowedDriver] = useState<number | null>(null)
  const [telemetry, setTelemetry] = useState<TelemetrySample | null>(null)
  const [bufferVersion, setBufferVersion] = useState(0)

  // Telemetry buffer
  const samplesRef = useRef<TelemetrySample[]>([])
  const bufferStartRef = useRef(0)
  const bufferEndRef = useRef(0)
  const fetchingRef = useRef(false)
  const driverRef = useRef<number | null>(null)

  // Follow/unfollow (toggles when the same driver is clicked, e.g. on the map)
  const followDriver = useCallback((driverNumber: number | null) => {
    if (driverNumber === followedDriver) {
      setFollowedDriver(null)
    } else {
      setFollowedDriver(driverNumber)
    }
  }, [followedDriver])

  // Always follow the given driver (no toggle) — used for radio-tick clicks.
  const selectDriver = useCallback((driverNumber: number) => {
    setFollowedDriver(driverNumber)
  }, [])

  // Reset telemetry buffer on driver change
  useEffect(() => {
    driverRef.current = followedDriver
    samplesRef.current = []
    bufferStartRef.current = 0
    bufferEndRef.current = 0
    fetchingRef.current = false
    setTelemetry(null)
  }, [followedDriver])

  // Fetch telemetry chunk
  const fetchChunk = useCallback(async (fromSeconds: number) => {
    if (!sessionKey || !dataStart || !followedDriver || fetchingRef.current) return
    fetchingRef.current = true
    try {
      const fromTime = new Date(new Date(dataStart).getTime() + fromSeconds * 1000).toISOString()
      const data = await api.getCarTelemetry(sessionKey, followedDriver, fromTime, CHUNK_SECONDS)
      // Only apply if still following the same driver
      if (driverRef.current !== followedDriver) return
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
    } catch {
      // ignore
    }
    fetchingRef.current = false
  }, [sessionKey, dataStart, followedDriver])

  // Initial fetch when following starts
  useEffect(() => {
    if (followedDriver && sessionKey && dataStart) {
      fetchChunk(Math.max(0, currentTime - 2))
    }
  }, [followedDriver, sessionKey, dataStart])

  // Pre-fetch next chunk
  useEffect(() => {
    if (!followedDriver) return
    if (currentTime > bufferEndRef.current - 10 && currentTime < totalDuration) {
      fetchChunk(bufferEndRef.current)
    }
  }, [currentTime, totalDuration, followedDriver, fetchChunk])

  // Refetch on seek (large jump)
  useEffect(() => {
    if (!followedDriver) return
    if (currentTime < bufferStartRef.current || currentTime > bufferEndRef.current) {
      samplesRef.current = []
      bufferStartRef.current = 0
      bufferEndRef.current = 0
      fetchChunk(Math.max(0, currentTime - 2))
    }
  }, [currentTime, followedDriver, fetchChunk])

  // Derive current telemetry sample
  useEffect(() => {
    if (!followedDriver || samplesRef.current.length === 0) {
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
  }, [currentTime, followedDriver, bufferVersion])

  return {
    followedDriver,
    followDriver,
    selectDriver,
    telemetry,
  }
}
