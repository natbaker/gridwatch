import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SeasonCalendar } from '../components/calendar/SeasonCalendar'
import { api } from '../api/client'
import type { Race, NextSessionResponse } from '../types'

const race: Race = {
  round: 12,
  name: 'Belgian Grand Prix',
  country: 'Belgium',
  city: 'Spa',
  circuit: 'Circuit de Spa-Francorchamps',
  flag_emoji: '🇧🇪',
  date_start: '2026-07-17',
  date_end: '2026-07-19',
  race_date: '2026-07-19T13:00:00Z',
  is_sprint_weekend: false,
  is_completed: false,
  is_cancelled: false,
  latitude: 0,
  longitude: 0,
  timezone: 'Europe/Brussels',
  sessions: [{ name: 'Qualifying', start_utc: '2026-07-18T14:00:00Z' }],
  result: null,
}

function renderCalendar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SeasonCalendar />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('SeasonCalendar — in-progress race weekend', () => {
  it('links to /live when the current race weekend has a live session', async () => {
    vi.spyOn(api, 'getSchedule').mockResolvedValue({ season: 2026, total_races: 1, races: [race], warnings: [] })
    vi.spyOn(api, 'getNextSession').mockResolvedValue({
      race: { round: 12, name: race.name, country: race.country, city: race.city, circuit: race.circuit, flag_emoji: race.flag_emoji, timezone: race.timezone, is_sprint_weekend: false },
      session: { name: 'Qualifying', short_name: 'QUAL', start_utc: '2026-07-18T14:00:00Z', end_utc: '2026-07-18T15:00:00Z', is_live: true },
      weekend_sessions: [],
      warnings: [],
    } satisfies NextSessionResponse)

    renderCalendar()

    const liveLink = await screen.findByText(/LIVE/)
    expect(liveLink.closest('a')).toHaveAttribute('href', '/live')
  })
})
