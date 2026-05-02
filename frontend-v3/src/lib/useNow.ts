import { useEffect, useState } from 'react'

// Returns the current hour-of-day as a fractional number (e.g. 13.78).
// Updates every minute. Override via ?hour=NN query for design preview.
export function useNow(): number {
  const [now, setNow] = useState<Date>(() => new Date())

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const override = params.get('hour')
    if (override !== null && !Number.isNaN(parseFloat(override))) {
      return
    }
    const tick = () => setNow(new Date())
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [])

  const params = new URLSearchParams(window.location.search)
  const override = params.get('hour')
  if (override !== null) {
    const v = parseFloat(override)
    if (!Number.isNaN(v)) return v
  }
  return now.getHours() + now.getMinutes() / 60
}
