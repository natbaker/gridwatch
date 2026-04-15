import { createContext, useContext, useState, type ReactNode } from 'react'

const CURRENT_SEASON = 2026
const AVAILABLE_SEASONS = [2026, 2025, 2024, 2023]

interface SeasonContextType {
  season: number
  setSeason: (s: number) => void
  isCurrentSeason: boolean
  availableSeasons: number[]
}

const SeasonContext = createContext<SeasonContextType>({
  season: CURRENT_SEASON,
  setSeason: () => {},
  isCurrentSeason: true,
  availableSeasons: AVAILABLE_SEASONS,
})

export function SeasonProvider({ children }: { children: ReactNode }) {
  const [season, setSeason] = useState(CURRENT_SEASON)

  return (
    <SeasonContext.Provider value={{
      season,
      setSeason,
      isCurrentSeason: season === CURRENT_SEASON,
      availableSeasons: AVAILABLE_SEASONS,
    }}>
      {children}
    </SeasonContext.Provider>
  )
}

export function useSeason() {
  return useContext(SeasonContext)
}
