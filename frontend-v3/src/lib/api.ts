import type {
  BackendHabit,
  BackendHabitLog,
  PrimaryTargetResponse,
  UserContextResponse,
} from '@/types/api'

// Empty default → fetch hits a relative path (`/api/...`), letting vite's
// `/api` proxy forward to localhost:8000 in dev. Override with an absolute
// URL only for production deployments.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

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
    let detail = ''
    try {
      const body = await res.json()
      detail = body?.error?.message ?? body?.detail ?? ''
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, `${method} ${path} → ${res.status}${detail ? `: ${detail}` : ''}`)
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
export const apiDelete = <T>(path: string) => apiFetch<T>('DELETE', path)

// ─── Primary Target ───────────────────────────────────────

export const fetchPrimaryTarget = () =>
  apiGet<PrimaryTargetResponse | null>('/api/primary-target')

export interface UpsertPrimaryTargetBody {
  value: string
  set_date?: string
  completed?: boolean
}

export const upsertPrimaryTarget = (body: UpsertPrimaryTargetBody) =>
  apiPut<PrimaryTargetResponse>('/api/primary-target', body)

// ─── User Context (Memory) ────────────────────────────────

export const fetchUserContext = () => apiGet<UserContextResponse | null>('/api/user-context')

export const patchUserContext = (body: Partial<UserContextResponse>) =>
  apiPatch<UserContextResponse>('/api/user-context', body)

// ─── Habits ───────────────────────────────────────────────

export const fetchHabits = () =>
  apiGet<{ success: boolean; data: BackendHabit[] }>('/api/habits?include_today_log=true')

export interface CreateHabitBody {
  goal_id?: string
  title: string
  description?: string
  scheduled_time?: string
  metric_type?: string
  target_value?: number
  target_value_max?: number
  target_time?: string
  unit?: string
  proof_type?: 'none' | 'photo' | 'auto'
  source_kind?: string
  xp_base?: number
}

export const createHabit = (body: CreateHabitBody) =>
  apiPost<{ success: boolean; data: BackendHabit }>('/api/habits', body)

export interface UpdateHabitBody {
  action: 'manual_edit' | 'change_time' | 'add_habit' | 'remove_habit'
  title?: string
  scheduled_time?: string
  metric_type?: string
  target_value?: number
  target_value_max?: number
  target_time?: string
  unit?: string
  proof_type?: 'none' | 'photo' | 'auto'
  source_kind?: string
  xp_base?: number
}

export const updateHabit = (habitId: string, body: UpdateHabitBody) =>
  apiPatch<{ success: boolean; data: BackendHabit }>(`/api/habits/${habitId}`, body)

export const deleteHabit = (habitId: string) =>
  apiDelete<void>(`/api/habits/${habitId}`)

export interface UpdateHabitLogBody {
  date: string
  completed: boolean
  failure_reason?: string
  input_method?: 'manual' | 'voice' | 'shortcut'
  numeric_value?: number
  time_value?: string
  proof_url?: string
}

export const updateHabitLog = (habitId: string, body: UpdateHabitLogBody) =>
  apiPatch<{ success: boolean; data: BackendHabitLog }>(`/api/habits/${habitId}/log`, body)
