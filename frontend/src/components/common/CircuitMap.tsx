import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { CIRCUIT_PATHS } from '../../utils/constants'
import type { CarLocation } from '../../types'

const ZOOM_LEVELS = [1, 1.5, 2, 3, 4, 6]

interface CircuitMapProps {
  circuitName: string
  className?: string
  accentColor?: string
  cars?: CarLocation[]
  showLabels?: boolean
  dynamicTrackPath?: string
  flagSectors?: number[]
  miniSectors?: number[]
  sectorIndices?: number[]
  corners?: { number: number; x: number; y: number }[]
  followedDriver?: number | null
}

/** Extract the first two points from an SVG path to compute start/finish line position and angle. */
function getStartFinishLine(pathD: string): { x1: number; y1: number; x2: number; y2: number } | null {
  // Parse M x,y then next coordinate (L, C, or implicit)
  const nums = pathD.match(/[-\d.]+/g)
  if (!nums || nums.length < 4) return null

  const px = parseFloat(nums[0])
  const py = parseFloat(nums[1])
  const nx = parseFloat(nums[2])
  const ny = parseFloat(nums[3])

  // Direction along track
  const dx = nx - px
  const dy = ny - py
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return null

  // Perpendicular direction, scaled to line half-length
  const halfLen = 8
  const perpX = (-dy / len) * halfLen
  const perpY = (dx / len) * halfLen

  return {
    x1: px + perpX,
    y1: py + perpY,
    x2: px - perpX,
    y2: py - perpY,
  }
}

/** Sample points along a path element to build sub-paths for each sector (equal division fallback). */
function buildSectorPaths(
  pathEl: SVGPathElement,
  miniSectors: number[],
): string[] {
  const totalLen = pathEl.getTotalLength()
  const totalMiniSectors = miniSectors.reduce((a, b) => a + b, 0)
  if (totalMiniSectors === 0) return []

  const sectorLen = totalLen / totalMiniSectors
  const paths: string[] = []
  const SAMPLES_PER_SECTOR = 12

  for (let i = 0; i < totalMiniSectors; i++) {
    const startDist = i * sectorLen
    const endDist = (i + 1) * sectorLen
    const step = (endDist - startDist) / SAMPLES_PER_SECTOR
    let d = 'M'
    for (let j = 0; j <= SAMPLES_PER_SECTOR; j++) {
      const pt = pathEl.getPointAtLength(startDist + j * step)
      d += `${j === 0 ? '' : ' L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`
    }
    paths.push(d)
  }
  return paths
}

/** Build sector sub-paths from precise point indices into the SVG path. */
function buildSectorPathsFromIndices(pathD: string, indices: number[]): string[] {
  // Parse all coordinates from the path: M x,y L x,y L x,y ... Z
  const coordRegex = /[-\d.]+/g
  const nums = pathD.match(coordRegex)
  if (!nums || nums.length < 4) return []

  const points: [number, number][] = []
  for (let i = 0; i < nums.length - 1; i += 2) {
    points.push([parseFloat(nums[i]), parseFloat(nums[i + 1])])
  }

  // indices mark the end-point of each sector: [19, 28, 62, ...]
  // Sector i spans from indices[i-1] to indices[i] (0 to indices[0] for first)
  const paths: string[] = []
  let prevIdx = 0
  for (const endIdx of indices) {
    const clampedEnd = Math.min(endIdx, points.length - 1)
    if (clampedEnd <= prevIdx) {
      paths.push('')
      prevIdx = clampedEnd
      continue
    }
    const sectorPts = points.slice(prevIdx, clampedEnd + 1)
    const d = sectorPts.map((p, j) => `${j === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ')
    paths.push(d)
    prevIdx = clampedEnd
  }
  return paths
}

export function CircuitMap({ circuitName, className = '', accentColor, cars, showLabels = true, dynamicTrackPath, flagSectors, miniSectors, sectorIndices, corners, followedDriver }: CircuitMapProps) {
  const trackPath = dynamicTrackPath || Object.entries(CIRCUIT_PATHS).find(([key]) => circuitName.includes(key))?.[1]
  if (!trackPath) return null

  const sfLine = getStartFinishLine(trackPath)

  const BASE_W = 400
  const BASE_H = 300

  const [zoomIdx, setZoomIdx] = useState(0)
  const zoom = ZOOM_LEVELS[zoomIdx]
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragging = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const measureRef = useRef<SVGPathElement>(null)
  const [sectorPaths, setSectorPaths] = useState<string[]>([])

  // Build sector sub-paths — prefer precise indices from Multiviewer, fall back to equal division
  useEffect(() => {
    if (sectorIndices?.length && trackPath) {
      setSectorPaths(buildSectorPathsFromIndices(trackPath, sectorIndices))
      return
    }
    if (!measureRef.current || !miniSectors?.length || miniSectors.every(n => n === 0)) {
      setSectorPaths([])
      return
    }
    setSectorPaths(buildSectorPaths(measureRef.current, miniSectors))
  }, [trackPath, miniSectors?.join(','), sectorIndices?.join(',')])

  const flagSectorSet = useMemo(
    () => new Set(flagSectors ?? []),
    [flagSectors?.join(',')]
  )

  const clampPan = (px: number, py: number, z: number) => {
    const vw = BASE_W / z
    const vh = BASE_H / z
    return {
      x: Math.max(0, Math.min(BASE_W - vw, px)),
      y: Math.max(0, Math.min(BASE_H - vh, py)),
    }
  }

  const zoomIn = useCallback(() => {
    const nextIdx = Math.min(zoomIdx + 1, ZOOM_LEVELS.length - 1)
    const nextZoom = ZOOM_LEVELS[nextIdx]
    const cx = pan.x + BASE_W / zoom / 2
    const cy = pan.y + BASE_H / zoom / 2
    const newPanX = cx - BASE_W / nextZoom / 2
    const newPanY = cy - BASE_H / nextZoom / 2
    setZoomIdx(nextIdx)
    setPan(clampPan(newPanX, newPanY, nextZoom))
  }, [zoomIdx, zoom, pan])

  const zoomOut = useCallback(() => {
    const nextIdx = Math.max(zoomIdx - 1, 0)
    const nextZoom = ZOOM_LEVELS[nextIdx]
    const cx = pan.x + BASE_W / zoom / 2
    const cy = pan.y + BASE_H / zoom / 2
    const newPanX = cx - BASE_W / nextZoom / 2
    const newPanY = cy - BASE_H / nextZoom / 2
    setZoomIdx(nextIdx)
    setPan(clampPan(newPanX, newPanY, nextZoom))
  }, [zoomIdx, zoom, pan])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (zoom <= 1) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
  }, [zoom, pan])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const dx = ((e.clientX - dragging.current.startX) / rect.width) * BASE_W / zoom
    const dy = ((e.clientY - dragging.current.startY) / rect.height) * BASE_H / zoom
    setPan(clampPan(dragging.current.panX - dx, dragging.current.panY - dy, zoom))
  }, [zoom])

  const handlePointerUp = useCallback(() => {
    dragging.current = null
  }, [])

  const vw = BASE_W / zoom
  const vh = BASE_H / zoom
  const viewBox = `${pan.x} ${pan.y} ${vw} ${vh}`
  const interactive = (cars?.length ?? 0) > 0

  // Decorative mode: bare SVG with no wrapper or controls
  if (!interactive) {
    return (
      <svg
        viewBox={`0 0 ${BASE_W} ${BASE_H}`}
        className={className}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d={trackPath}
          stroke={accentColor || 'currentColor'}
          strokeWidth={2.5}
          style={!accentColor ? { color: 'var(--color-accent)' } : undefined}
        />
        {sfLine && (
          <line x1={sfLine.x1} y1={sfLine.y1} x2={sfLine.x2} y2={sfLine.y2} stroke="#fff" strokeWidth={1.5} opacity={0.7} />
        )}
      </svg>
    )
  }

  return (
    <div className={`relative ${className}`}>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className={`w-full h-full ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Hidden path for measuring sector positions */}
        <path ref={measureRef} d={trackPath} visibility="hidden" />

        {/* Track outline */}
        <path
          d={trackPath}
          stroke={accentColor || 'currentColor'}
          strokeWidth={cars?.length ? 2 : 2.5}
          style={!accentColor ? { color: 'var(--color-accent)' } : undefined}
          opacity={cars?.length ? 0.3 : 1}
        />

        {/* Yellow flag sector highlights */}
        {sectorPaths.map((d, i) => {
          // Sectors are 1-indexed in the flag data
          if (!flagSectorSet.has(i + 1)) return null
          return (
            <path
              key={`sector-${i}`}
              d={d}
              stroke="#EAB308"
              strokeWidth={6}
              opacity={0.5}
              className="animate-pulse"
            />
          )
        })}

        {/* Start/finish line */}
        {sfLine && (
          <line
            x1={sfLine.x1}
            y1={sfLine.y1}
            x2={sfLine.x2}
            y2={sfLine.y2}
            stroke="#fff"
            strokeWidth={1.5}
            opacity={0.7}
          />
        )}

        {/* Corner numbers */}
        {corners?.map((c) => (
          <text
            key={`corner-${c.number}`}
            x={c.x}
            y={c.y}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#6B7280"
            fontSize={5 / zoom}
            fontFamily="monospace"
            opacity={0.6}
          >
            {c.number}
          </text>
        ))}

        {/* Car positions */}
        {(cars ?? []).map((car) => {
          const isFollowed = followedDriver === car.driver_number
          return (
          <g key={car.driver_number}>
            {isFollowed && (
              <circle
                cx={car.x}
                cy={car.y}
                r={9 / zoom}
                fill="none"
                stroke="#fff"
                strokeWidth={1.5 / zoom}
                opacity={0.7}
                className="animate-pulse"
              />
            )}
            <circle
              cx={car.x}
              cy={car.y}
              r={isFollowed ? 6 / zoom : 5 / zoom}
              fill={car.team_color}
              stroke={isFollowed ? '#fff' : '#000'}
              strokeWidth={isFollowed ? 1.5 / zoom : 1 / zoom}
              opacity={isFollowed ? 1 : 0.9}
            />
            {showLabels && (
              <text
                x={car.x}
                y={car.y - 8 / zoom}
                textAnchor="middle"
                fill="#fff"
                fontSize={6 / zoom}
                fontFamily="monospace"
                fontWeight="bold"
              >
                {car.abbreviation}
              </text>
            )}
          </g>
          )
        })}
      </svg>
      <div className="absolute top-2 right-2 flex flex-col gap-0.5">
        <button
          onClick={zoomIn}
          disabled={zoomIdx >= ZOOM_LEVELS.length - 1}
          className="w-6 h-6 flex items-center justify-center text-xs font-mono rounded bg-bg-elevated/80 text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-default transition-colors"
        >
          +
        </button>
        <button
          onClick={zoomOut}
          disabled={zoomIdx <= 0}
          className="w-6 h-6 flex items-center justify-center text-xs font-mono rounded bg-bg-elevated/80 text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-default transition-colors"
        >
          −
        </button>
      </div>
    </div>
  )
}
