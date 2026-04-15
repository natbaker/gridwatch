import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api/client'
import type { TelemetrySample } from '../types'

const CHUNK_SECONDS = 30

export interface DriverFollowState {
  followedDriver: number | null
  followDriver: (driverNumber: number | null) => void
  telemetry: TelemetrySample | null
  isRadioPlaying: boolean
  radioMuted: boolean
  setRadioMuted: (m: boolean) => void
}

export function useDriverFollow(
  sessionKey: number | undefined,
  dataStart: string,
  currentTime: number,
  totalDuration: number,
  radioEvents: { t: number; n: number; url: string }[],
): DriverFollowState {
  const [followedDriver, setFollowedDriver] = useState<number | null>(null)
  const [telemetry, setTelemetry] = useState<TelemetrySample | null>(null)
  const [isRadioPlaying, setIsRadioPlaying] = useState(false)
  const [radioMuted, setRadioMuted] = useState(false)
  const [bufferVersion, setBufferVersion] = useState(0)

  // Telemetry buffer
  const samplesRef = useRef<TelemetrySample[]>([])
  const bufferStartRef = useRef(0)
  const bufferEndRef = useRef(0)
  const fetchingRef = useRef(false)
  const driverRef = useRef<number | null>(null)

  // Audio — use a fresh Audio object per clip, track the current one for cleanup
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const playedRef = useRef<Set<number>>(new Set())
  const lastRadioTimeRef = useRef(0)
  const currentTimeRef = useRef(currentTime)
  currentTimeRef.current = currentTime

  // Follow/unfollow
  const followDriver = useCallback((driverNumber: number | null) => {
    if (driverNumber === followedDriver) {
      setFollowedDriver(null)
    } else {
      setFollowedDriver(driverNumber)
    }
  }, [followedDriver])

  // Reset on driver change
  useEffect(() => {
    driverRef.current = followedDriver
    samplesRef.current = []
    bufferStartRef.current = 0
    bufferEndRef.current = 0
    fetchingRef.current = false
    setTelemetry(null)
    playedRef.current = new Set()
    lastRadioTimeRef.current = currentTimeRef.current
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current = null
    }
    setIsRadioPlaying(false)
  }, [followedDriver])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
        currentAudioRef.current = null
      }
    }
  }, [])

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
      playedRef.current = new Set()
      lastRadioTimeRef.current = currentTime
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
        currentAudioRef.current = null
      }
      setIsRadioPlaying(false)
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

  // Auto-play radio — always update lastRadioTimeRef even when muted
  useEffect(() => {
    if (!followedDriver) return
    const prevTime = lastRadioTimeRef.current
    lastRadioTimeRef.current = currentTime
    if (currentTime < prevTime) return
    if (radioMuted) return

    const driverRadio = radioEvents.filter(r => r.n === followedDriver)
    for (const r of driverRadio) {
      if (r.t > prevTime && r.t <= currentTime && !playedRef.current.has(r.t)) {
        playedRef.current.add(r.t)
        // Create a fresh Audio element for each clip
        const audio = new Audio(r.url)
        audio.addEventListener('playing', () => setIsRadioPlaying(true))
        audio.addEventListener('ended', () => {
          setIsRadioPlaying(false)
          if (currentAudioRef.current === audio) currentAudioRef.current = null
        })
        audio.addEventListener('error', () => {
          console.warn('Radio load error:', r.url)
          setIsRadioPlaying(false)
          if (currentAudioRef.current === audio) currentAudioRef.current = null
        })
        // Stop any currently playing clip
        if (currentAudioRef.current) {
          currentAudioRef.current.pause()
        }
        currentAudioRef.current = audio
        audio.play().catch((e) => {
          console.warn('Radio play failed:', e.message)
          setIsRadioPlaying(false)
        })
        break
      }
    }
  }, [currentTime, followedDriver, radioEvents, radioMuted])

  return {
    followedDriver,
    followDriver,
    telemetry,
    isRadioPlaying,
    radioMuted,
    setRadioMuted,
  }
}
