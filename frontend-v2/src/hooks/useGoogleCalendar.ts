import { useState, useEffect, useCallback } from 'react'

const TOKEN_KEY = 'google:cal:token'
const TOKEN_EXP_KEY = 'google:cal:token_exp'
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string
const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly'

export interface CalEvent {
  id: string
  summary: string
  start: { dateTime: string }
  end: { dateTime: string }
  colorId?: string
}

function getStoredToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY)
  const exp = localStorage.getItem(TOKEN_EXP_KEY)
  if (!token || !exp) return null
  if (Date.now() > Number(exp)) {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_EXP_KEY)
    return null
  }
  return token
}

function parseHashToken(): string | null {
  const hash = window.location.hash
  if (!hash.includes('access_token=')) return null
  const params = new URLSearchParams(hash.slice(1))
  const token = params.get('access_token')
  const expiresIn = params.get('expires_in')
  if (!token) return null
  const exp = Date.now() + Number(expiresIn ?? 3600) * 1000
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(TOKEN_EXP_KEY, String(exp))
  // Clean hash from URL without reload
  history.replaceState(null, '', window.location.pathname + window.location.search)
  return token
}

export function useGoogleCalendar() {
  const [token, setToken] = useState<string | null>(() => parseHashToken() ?? getStoredToken())
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isConnected = Boolean(token)

  const connect = useCallback(() => {
    const redirectUri = window.location.origin
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.searchParams.set('client_id', CLIENT_ID)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('response_type', 'token')
    url.searchParams.set('scope', SCOPES)
    url.searchParams.set('prompt', 'select_account')
    window.location.href = url.toString()
  }, [])

  const disconnect = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_EXP_KEY)
    setToken(null)
    setEvents([])
  }, [])

  const fetchEvents = useCallback(async (weekStart: Date) => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const timeMin = new Date(weekStart)
      timeMin.setHours(0, 0, 0, 0)
      const timeMax = new Date(weekStart)
      timeMax.setDate(timeMax.getDate() + 7)
      timeMax.setHours(23, 59, 59, 999)

      const params = new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '100',
      })
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.status === 401) {
        disconnect()
        return
      }
      const data = await res.json()
      setEvents((data.items ?? []).filter((e: CalEvent) => e.start?.dateTime))
    } catch {
      setError('カレンダーの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [token, disconnect])

  const createEvent = useCallback(async (
    summary: string,
    startDateTime: string,
    durationMinutes: number,
  ): Promise<CalEvent | null> => {
    if (!token) return null
    const start = new Date(startDateTime)
    const end = new Date(start.getTime() + durationMinutes * 60_000)
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const body = {
      summary,
      start: { dateTime: start.toISOString(), timeZone: tz },
      end: { dateTime: end.toISOString(), timeZone: tz },
    }
    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    )
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      const reason = errData?.error?.message ?? `HTTP ${res.status}`
      if (res.status === 401) disconnect()
      throw new Error(reason)
    }
    const created: CalEvent = await res.json()
    setEvents(prev => [...prev, created])
    return created
  }, [token])

  const updateEvent = useCallback(async (
    eventId: string,
    startDateTime: string,
  ): Promise<CalEvent | null> => {
    if (!token) return null
    const existing = events.find(e => e.id === eventId)
    if (!existing) return null

    const origDurationMs = new Date(existing.end.dateTime).getTime() - new Date(existing.start.dateTime).getTime()
    const start = new Date(startDateTime)
    const end = new Date(start.getTime() + origDurationMs)
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: { dateTime: start.toISOString(), timeZone: tz },
          end: { dateTime: end.toISOString(), timeZone: tz },
        }),
      }
    )
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      if (res.status === 401) disconnect()
      throw new Error(errData?.error?.message ?? `HTTP ${res.status}`)
    }
    const updated: CalEvent = await res.json()
    setEvents(prev => prev.map(e => e.id === eventId ? updated : e))
    return updated
  }, [token, events, disconnect])

  // Re-check token on focus (may have come back from OAuth)
  useEffect(() => {
    const onFocus = () => {
      const stored = getStoredToken()
      if (stored && stored !== token) setToken(stored)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [token])

  return { isConnected, connect, disconnect, fetchEvents, createEvent, updateEvent, events, loading, error }
}
