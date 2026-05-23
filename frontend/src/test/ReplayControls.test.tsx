import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReplayControls } from '../components/common/ReplayControls'

const baseProps = {
  isPlaying: false,
  speed: 1,
  currentTime: 0,
  totalDuration: 3600,
  onTogglePlay: vi.fn(),
  onSetSpeed: vi.fn(),
  onSeek: vi.fn(),
}

describe('ReplayControls — LIVE button', () => {
  it('does not render LIVE button when isLive is false', () => {
    render(<ReplayControls {...baseProps} isLive={false} />)
    expect(screen.queryByText(/LIVE/)).toBeNull()
  })

  it('does not render LIVE button when isLive is not provided', () => {
    render(<ReplayControls {...baseProps} />)
    expect(screen.queryByText(/LIVE/)).toBeNull()
  })

  it('renders LIVE button when isLive=true and onSeekToLive provided', () => {
    const onSeekToLive = vi.fn()
    render(
      <ReplayControls
        {...baseProps}
        isLive
        liveOffset={3000}
        onSeekToLive={onSeekToLive}
      />
    )
    expect(screen.getByText(/LIVE/)).toBeTruthy()
  })

  it('shows → LIVE when currentTime is far from liveOffset', () => {
    render(
      <ReplayControls
        {...baseProps}
        isLive
        liveOffset={3000}
        currentTime={100}
        onSeekToLive={vi.fn()}
      />
    )
    expect(screen.getByText('→ LIVE')).toBeTruthy()
  })

  it('shows ● LIVE when currentTime is within 15s of liveOffset', () => {
    render(
      <ReplayControls
        {...baseProps}
        isLive
        liveOffset={3000}
        currentTime={2992}
        onSeekToLive={vi.fn()}
      />
    )
    expect(screen.getByText('● LIVE')).toBeTruthy()
  })

  it('calls onSeekToLive when LIVE button is clicked', () => {
    const onSeekToLive = vi.fn()
    render(
      <ReplayControls
        {...baseProps}
        isLive
        liveOffset={3000}
        onSeekToLive={onSeekToLive}
      />
    )
    fireEvent.click(screen.getByText(/LIVE/))
    expect(onSeekToLive).toHaveBeenCalledOnce()
  })
})

describe('ReplayControls — speed buttons', () => {
  it('calls onSetSpeed with correct value when speed button clicked', () => {
    const onSetSpeed = vi.fn()
    render(<ReplayControls {...baseProps} onSetSpeed={onSetSpeed} />)

    // Speed buttons show 1x, 2x, 5x, 10x, 20x
    const btn2x = screen.getAllByText('2x')[0]
    fireEvent.click(btn2x)
    expect(onSetSpeed).toHaveBeenCalledWith(2)
  })

  it('highlights the active speed button', () => {
    render(<ReplayControls {...baseProps} speed={5} />)
    // The active button has bg-accent class (text content is "5x")
    const btn5x = screen.getAllByText('5x')[0]
    expect(btn5x.className).toContain('bg-accent')
  })
})

describe('ReplayControls — play/pause', () => {
  it('shows play icon when not playing', () => {
    const { container } = render(<ReplayControls {...baseProps} isPlaying={false} />)
    // The play icon is an SVG path with a triangle shape — the pause icon has two rects
    const rects = container.querySelectorAll('rect')
    expect(rects.length).toBe(0) // no pause rects
  })

  it('calls onTogglePlay when play button is clicked', () => {
    const onTogglePlay = vi.fn()
    render(<ReplayControls {...baseProps} onTogglePlay={onTogglePlay} />)
    const playButton = document.querySelector('button svg')?.closest('button')
    fireEvent.click(playButton || document.querySelector('button')!)
    expect(onTogglePlay).toHaveBeenCalled()
  })
})
