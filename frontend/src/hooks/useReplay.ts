import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { CarLocation, ReplayPosition, ReplayStanding } from '../types'
import { computeStandings } from '../components/session/utils'

const CHUNK_SECONDS = 30
const FRAME_INTERVAL_MS = 250 // 4 fps

export type { ReplayStanding }

export interface RaceControlEvent {
  t: number
  category: string
  flag: string | null
  message: string
  sector?: number
}

export interface TrackWeather {
  air_temp: number | null
  track_temp: number | null
  humidity: number | null
  wind_speed: number | null
  wind_direction: number | null
  rainfall: number
}

export interface ReplayState {
  isReady: boolean
  isPlaying: boolean
  isLive: boolean
  liveOffset: number | null
  speed: number
  currentTime: number
  totalDuration: number
  cars: CarLocation[]
  standings: ReplayStanding[]
  activeFlag: RaceControlEvent | null
  activeFlagSectors: number[]
  miniSectors: number[]
  sectorIndices: number[]
  corners: { number: number; x: number; y: number }[]
  driversInPit: { driver_number: number; entry_time: number; duration: number | null }[]
  weather: TrackWeather | null
  currentLap: number
  totalLaps: number
  lapTimes: { t: number; lap: number }[]
  radioEvents: { t: number; n: number; url: string }[]
  intervalEvents: { t: number; n: number; g: number | null; i: number | null }[]
  driverMeta: Record<string, { abbreviation: string; team_color: string }>
  dataStart: string
  trackPath: string
  sessionName: string
  circuit: string
  play: () => void
  pause: () => void
  togglePlay: () => void
  setSpeed: (s: number) => void
  seek: (t: number) => void
  seekToLive: () => void
}

export function useReplay(sessionKey: number | undefined): ReplayState {
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [hasPositions, setHasPositions] = useState(false)

  const positionsRef = useRef<ReplayPosition[]>([])
  const bufferEndRef = useRef(0)
  const fetchingRef = useRef(false)

  // Reset all playback state when session changes
  useEffect(() => {
    setCurrentTime(0)
    setIsPlaying(false)
    setSpeed(1)
    setHasPositions(false)
    positionsRef.current = []
    bufferEndRef.current = 0
    fetchingRef.current = false
  }, [sessionKey])

  const { data: info } = useQuery({
    queryKey: ['replayInfo', sessionKey],
    queryFn: () => api.getReplayInfo(sessionKey!),
    enabled: !!sessionKey,
    refetchInterval: (query) => query.state.data?.is_live ? 15000 : false,
  })

  const dataStart = info?.data_start ?? ''
  const dataEnd = info?.data_end ?? ''
  const rawDuration = dataStart && dataEnd
    ? (new Date(dataEnd).getTime() - new Date(dataStart).getTime()) / 1000
    : 0
  // For finished sessions, cap at last lap + 30s to avoid dead space at the end.
  // For live sessions, use full planned duration so the timebar has room for new laps.
  const lastLapT = info?.lap_events?.length ? info.lap_events[info.lap_events.length - 1].t : 0
  const isLive = !!info?.is_live
  const totalDuration = (lastLapT > 0 && !isLive) ? Math.min(rawDuration, lastLapT + 30) : rawDuration

  const drivers = info?.drivers ?? {}

  // Compute the earliest event time so we start playback where data exists
  const posT = info?.position_events?.[0]?.t ?? Infinity
  const ivT = info?.interval_events?.[0]?.t ?? Infinity
  const earliestEvent = Math.min(posT, ivT)
  const firstEventTime = earliestEvent === Infinity ? 0 : Math.max(0, earliestEvent - 2)


  // Fetch a chunk of position data
  const fetchChunk = useCallback(async (fromSeconds: number) => {
    if (!sessionKey || !dataStart || fetchingRef.current) return
    fetchingRef.current = true
    try {
      const fromTime = new Date(new Date(dataStart).getTime() + fromSeconds * 1000).toISOString()
      const data = await api.getReplayPositions(sessionKey, fromTime, CHUNK_SECONDS)
      if (data.positions.length > 0) {
        const adjusted = data.positions.map(p => ({ ...p, t: p.t + fromSeconds }))
        positionsRef.current = [
          ...positionsRef.current.filter(p => p.t < fromSeconds),
          ...adjusted,
        ]
        bufferEndRef.current = fromSeconds + CHUNK_SECONDS
        setHasPositions(true)
      }
    } catch {
      // ignore
    }
    fetchingRef.current = false
  }, [sessionKey, dataStart])

  useEffect(() => {
    if (info && positionsRef.current.length === 0) {
      fetchChunk(Math.max(0, firstEventTime - 2))
    }
  }, [info, fetchChunk, firstEventTime])

  // Playback timer
  useEffect(() => {
    if (!isPlaying || !totalDuration) return
    const interval = setInterval(() => {
      setCurrentTime(prev => {
        const next = prev + (speed * FRAME_INTERVAL_MS / 1000)
        if (next >= totalDuration) {
          setIsPlaying(false)
          return totalDuration
        }
        return next
      })
    }, FRAME_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isPlaying, speed, totalDuration])

  // Pre-fetch next chunk
  useEffect(() => {
    if (currentTime > bufferEndRef.current - 10 && currentTime < totalDuration) {
      fetchChunk(bufferEndRef.current)
    }
  }, [currentTime, totalDuration, fetchChunk])

  // Compute current car positions
  const cars: CarLocation[] = []
  if (positionsRef.current.length > 0) {
    // Collect last two positions per driver to detect stopped cars
    const latest = new Map<number, ReplayPosition>()
    const prev = new Map<number, ReplayPosition>()
    for (const p of positionsRef.current) {
      if (p.t > currentTime + 0.5) break
      const existing = latest.get(p.n)
      if (!existing || p.t > existing.t) {
        if (existing) prev.set(p.n, existing)
        latest.set(p.n, p)
      }
    }
    for (const [num, pos] of latest) {
      // Hide drivers that haven't moved (DNF/parked) — compare last two positions
      const prevPos = prev.get(num)
      if (prevPos && currentTime - pos.t > 10) {
        const dx = pos.x - prevPos.x
        const dy = pos.y - prevPos.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 1) continue  // less than 1 SVG unit of movement = stationary
      }
      const driverInfo = drivers[String(num)]
      if (driverInfo) {
        cars.push({
          driver_number: num,
          abbreviation: driverInfo.abbreviation,
          team_color: driverInfo.team_color,
          x: pos.x,
          y: pos.y,
        })
      }
    }
  }

  // Standings follow the authoritative running-order feed (see computeStandings)
  const standings: ReplayStanding[] = info ? computeStandings(info, currentTime) : []

  // Compute active race control flag and per-sector yellows
  let activeFlag: RaceControlEvent | null = null
  const sectorFlags = new Map<number, { flag: string; t: number }>()
  if (info?.race_control) {
    for (const e of info.race_control) {
      if (e.t > currentTime) break
      // Track per-sector flags
      if (e.sector !== undefined) {
        if (e.flag === 'CLEAR' || e.flag === 'GREEN') {
          sectorFlags.delete(e.sector)
        } else if (e.flag === 'YELLOW' || e.flag === 'DOUBLE YELLOW') {
          sectorFlags.set(e.sector, { flag: e.flag, t: e.t })
        }
      }
      // Track global flag state
      if (e.flag === 'GREEN' || e.flag === 'CLEAR' || e.flag === 'CHEQUERED') {
        activeFlag = e.flag === 'CHEQUERED' ? e : null
      } else if (e.flag === 'YELLOW' || e.flag === 'DOUBLE YELLOW' || e.flag === 'RED' || e.category === 'SafetyCar') {
        activeFlag = e
      }
    }
    if (activeFlag && currentTime - activeFlag.t > 60) activeFlag = null
    // Expire sector flags after 60s
    for (const [sec, info_] of sectorFlags) {
      if (currentTime - info_.t > 60) sectorFlags.delete(sec)
    }
  }
  const activeFlagSectors = Array.from(sectorFlags.keys()).sort((a, b) => a - b)

  // Compute current lap
  let currentLap = 0
  const lapEvents = info?.lap_events ?? []
  for (const e of lapEvents) {
    if (e.t > currentTime) break
    currentLap = e.lap
  }
  const totalLaps = lapEvents.length > 0 ? lapEvents[lapEvents.length - 1].lap : 0

  // Compute which drivers are currently in pit
  const driversInPit: { driver_number: number; entry_time: number; duration: number | null }[] = []
  const pitEvents = info?.pit_events ?? []
  for (const p of pitEvents) {
    const endTime = p.d != null ? p.t + p.d : p.t + 30 // fallback 30s if no duration
    if (p.t <= currentTime && currentTime < endTime) {
      driversInPit.push({
        driver_number: p.n,
        entry_time: p.t,
        duration: p.d,
      })
    }
  }

  // Compute current trackside weather
  let weather: TrackWeather | null = null
  const weatherEvents = info?.weather_events ?? []
  for (const w of weatherEvents) {
    if (w.t > currentTime) break
    weather = {
      air_temp: w.air_temp,
      track_temp: w.track_temp,
      humidity: w.humidity,
      wind_speed: w.wind_speed,
      wind_direction: w.wind_direction,
      rainfall: w.rainfall,
    }
  }

  const seek = useCallback((t: number) => {
    const clamped = Math.max(0, Math.min(t, totalDuration))
    setCurrentTime(clamped)
    if (clamped >= bufferEndRef.current || clamped < bufferEndRef.current - CHUNK_SECONDS * 2) {
      positionsRef.current = []
      bufferEndRef.current = 0
      fetchChunk(Math.max(0, clamped - 2))
    }
  }, [totalDuration, fetchChunk])

  const liveOffset = isLive && dataStart
    ? Math.min((Date.now() - new Date(dataStart).getTime()) / 1000, totalDuration)
    : null

  const seekToLive = useCallback(() => {
    if (!dataStart) return
    const offset = Math.min((Date.now() - new Date(dataStart).getTime()) / 1000, totalDuration)
    seek(offset)
  }, [dataStart, totalDuration, seek])

  return {
    isReady: !!info && hasPositions,
    isPlaying,
    isLive,
    liveOffset,
    speed,
    currentTime,
    totalDuration,
    cars,
    standings,
    activeFlag,
    activeFlagSectors,
    miniSectors: info?.mini_sectors ?? [],
    sectorIndices: info?.sector_indices ?? [],
    corners: info?.corners ?? [],
    driversInPit,
    weather,
    currentLap,
    totalLaps,
    lapTimes: info?.lap_events ?? [],
    radioEvents: info?.radio_events ?? [],
    intervalEvents: info?.interval_events ?? [],
    driverMeta: drivers,
    dataStart: dataStart,
    trackPath: info?.track_path ?? '',
    sessionName: info?.session_name ?? '',
    circuit: info?.circuit ?? '',
    play: () => {
      if (totalDuration > 0) {
        if (currentTime < firstEventTime) setCurrentTime(firstEventTime)
        setIsPlaying(true)
      }
    },
    pause: () => setIsPlaying(false),
    togglePlay: () => {
      if (totalDuration > 0) {
        if (!isPlaying && currentTime < firstEventTime) setCurrentTime(firstEventTime)
        setIsPlaying(p => !p)
      }
    },
    setSpeed,
    seek,
    seekToLive,
  }
}
