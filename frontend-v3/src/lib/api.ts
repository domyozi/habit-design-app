import type { BackendHabit, PrimaryTargetResponse, UserContextResponse } from '@/types/api'

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000'

function getStoredAccessToken(): string | null {
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key?.startsWith('sb-') || !key.endsWith('-auth-token')) continue
    const raw = localStorage.getItem(key)
    if (!raw) continue
    try {
      const session = JSON.parse(raw)
      const token = session?.access_token
      if (typeof token === 'string' && token.length > 0) return token
    } catch {
      /* ignore */
    }
  }
  return null
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function apiFetch<T>(method: string, path: string, data?: unknown): Promise<T> {
  const token = getStoredAccessToken()
  const headers: Record<string, string> = {}
  if (data !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: data !== undefined ? JSON.stringify(data) : undefined,
  })

  if (!res.ok) {
    throw new ApiError(res.status, `${method} ${path} → ${res.status}`)
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }

  return res.json() as Promise<T>
}

export const apiGet = <T>(path: string) => apiFetch<T>('GET', path)
export const apiPost = <T>(path: string, body?: unknown) => apiFetch<T>('POST', path, body)
export const apiPut = <T>(path: string, body?: unknown) => apiFetch<T>('PUT', path, body)
export const apiPatch = <T>(path: string, body?: unknown) => apiFetch<T>('PATCH', path, body)

// ─── Typed endpoints ──────────────────────────────────────

export const fetchPrimaryTarget = () =>
  apiGet<PrimaryTargetResponse | null>('/api/primary-target')

export const fetchUserContext = () => apiGet<UserContextResponse | null>('/api/user-context')

export const fetchHabits = () =>
  apiGet<{ success: boolean; data: BackendHabit[] }>('/api/habits?include_today_log=true')
