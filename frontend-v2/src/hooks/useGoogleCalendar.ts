import { useState, useEffect, useCallback } from 'react'

const TOKEN_KEY = 'google:cal:token'
const TOKEN_EXP_KEY = 'google:cal:token_exp'
const OAUTH_STATE_KEY = 'google:cal:oauth_state'
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
  const returnedState = params.get('state')
  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY)
  sessionStorage.removeItem(OAUTH_STATE_KEY)
  history.replaceState(null, '', window.location.pathname + window.location.search)
  if (!returnedState || !expectedState || returnedState !== expectedState) return null
  if (!token) return null
  const exp = Date.now() + Number(expiresIn ?? 3600) * 1000
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(TOKEN_EXP_KEY, String(exp))
  return token
}

function buildAuthUrl(silent: boolean): string {
  const redirectUri = window.location.origin
  const stateBytes = new Uint8Array(16)
  crypto.getRandomValues(stateBytes)
  const state = Array.from(stateBytes).map(b => b.toString(16).padStart(2, '0')).join('')
  sessionStorage.setItem(OAUTH_STATE_KEY, state)
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', CLIENT_ID)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'token')
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('prompt', silent ? 'none' : 'select_account')
  url.searchParams.set('state', state)
  return url.toString()
}

// ポップアップとして開かれた場合、トークンを保存してウィンドウを閉じる
const isPopup = typeof window !== 'undefined' && window.opener != null && window.name === 'gcal-auth'
if (isPopup) {
  const t = parseHashToken()
  if (t) setTimeout(() => window.close(), 300)
}

export function useGoogleCalendar() {
  const [token, setToken] = useState<string | null>(() => {
    if (isPopup) return null
    return parseHashToken() ?? getStoredToken()
  })
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isConnected = Boolean(token)

  const connect = useCallback((silent = false) => {
    const url = buildAuthUrl(silent)
    window.open(url, 'gcal-auth', 'width=520,height=640,left=200,top=100,noopener=0')
  }, [])

  const disconnect = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_EXP_KEY)
    setToken(null)
    setEvents([])
  }, [])

  // ポップアップで保存されたトークンを storage イベントで受け取る
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === TOKEN_KEY && e.newValue) {
        const fresh = getStoredToken()
        if (fresh) setToken(fresh)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // 有効期限5分前にサイレント再認証
  useEffect(() => {
    if (!token) return
    const exp = Number(localStorage.getItem(TOKEN_EXP_KEY) ?? 0)
    const msUntilExpiry = exp - Date.now()
    const refreshAt = msUntilExpiry - 5 * 60 * 1000
    if (refreshAt <= 0) return
    const timer = setTimeout(() => connect(true), refreshAt)
    return () => clearTimeout(timer)
  }, [token, connect])

  // フォーカス時にトークン再確認
  useEffect(() => {
    const onFocus = () => {
      const stored = getStoredToken()
      if (stored && stored !== token) setToken(stored)
      else if (!stored && token) setToken(null)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [token])

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
        // サイレント再認証を試みる（ポップアップ）
        connect(true)
        return
      }
      const data = await res.json()
      setEvents((data.items ?? []).filter((e: CalEvent) => e.start?.dateTime))
    } catch {
      setError('カレンダーの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [token, connect])

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
      if (res.status === 401) connect(true)
      throw new Error(reason)
    }
    const created: CalEvent = await res.json()
    setEvents(prev => [...prev, created])
    return created
  }, [token, connect])

  const updateEvent = useCallback(async (
    eventId: string,
    startDateTime: string,
    durationMinutes?: number,
  ): Promise<CalEvent | null> => {
    if (!token) return null
    const existing = events.find(e => e.id === eventId)
    if (!existing) return null

    const origDurationMs = new Date(existing.end.dateTime).getTime() - new Date(existing.start.dateTime).getTime()
    const durationMs = durationMinutes ? durationMinutes * 60_000 : origDurationMs
    const start = new Date(startDateTime)
    const end = new Date(start.getTime() + durationMs)
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
      if (res.status === 401) connect(true)
      throw new Error(errData?.error?.message ?? `HTTP ${res.status}`)
    }
    const updated: CalEvent = await res.json()
    setEvents(prev => prev.map(e => e.id === eventId ? updated : e))
    return updated
  }, [token, events, connect])

  return { isConnected, connect, disconnect, fetchEvents, createEvent, updateEvent, events, loading, error }
}
