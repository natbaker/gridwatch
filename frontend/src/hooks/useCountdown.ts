import { useState, useEffect } from 'react'
import type { Countdown } from '../types'

export function useCountdown(targetUtc: string | null): Countdown {
  const [countdown, setCountdown] = useState<Countdown>({
    days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true,
  })

  useEffect(() => {
    if (!targetUtc) return

    function calc() {
      const diff = new Date(targetUtc!).getTime() - Date.now()
      if (diff <= 0) {
        setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true })
        return
      }
      setCountdown({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
        isExpired: false,
      })
    }

    calc()
    const interval = setInterval(calc, 1000)
    return () => clearInterval(interval)
  }, [targetUtc])

  return countdown
}
