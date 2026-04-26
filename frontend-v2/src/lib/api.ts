import axios from 'axios'
import type {
  CreateKpiRequest,
  GoalWithKgi,
  Kpi,
  KpiChartApiResponse,
  KpiLogApiResponse,
  KpiTodayApiResponse,
  SetKgiRequest,
  UpsertKpiLogRequest,
  UpdateKgiCurrentValueRequest,
} from '../types'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export const api = axios.create({ baseURL: API_BASE_URL })

export const getStoredAccessToken = (): string | null => {
  const authKeys: string[] = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key?.startsWith('sb-') && key.endsWith('-auth-token')) authKeys.push(key)
  }

  for (const key of authKeys) {
    const raw = localStorage.getItem(key)
    if (!raw) continue
    try {
      const session = JSON.parse(raw)
      const token = session?.access_token
      if (typeof token === 'string' && token.length > 0) return token
    } catch { /* ignore */ }
  }

  return null
}

// Supabase JWT を Authorization ヘッダーに自動付与
api.interceptors.request.use(config => {
  const token = getStoredAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const apiGet = <T>(url: string) => api.get<T>(url).then(r => r.data)
export const apiPost = <T>(url: string, data?: unknown) => api.post<T>(url, data).then(r => r.data)
export const apiPut = <T>(url: string, data?: unknown) => api.put<T>(url, data).then(r => r.data)
export const apiPatch = <T>(url: string, data?: unknown) => api.patch<T>(url, data).then(r => r.data)
export const apiDelete = <T>(url: string) => api.delete<T>(url).then(r => r.data)

// ============================================================
// KGI/KPI API クライアント (TASK-0034)
// ============================================================

// ─── KGI API ────────────────────────────────────────────────

/**
 * Goal を KGI として設定（または KGI 属性を更新）する
 * PATCH /api/goals/{goal_id}/kgi
 */
export const patchGoalKgi = (goalId: string, req: SetKgiRequest) =>
  apiPatch<{ success: boolean; data: GoalWithKgi }>(`/api/goals/${goalId}/kgi`, req)

/**
 * KGI の現在値のみを更新する
 * PATCH /api/goals/{goal_id}/kgi/current-value
 */
export const patchGoalKgiCurrentValue = (goalId: string, currentValue: number) => {
  const req: UpdateKgiCurrentValueRequest = { current_value: currentValue }
  return apiPatch<{ success: boolean; data: GoalWithKgi }>(
    `/api/goals/${goalId}/kgi/current-value`,
    req,
  )
}

/**
 * KGI 情報付きで Goal 一覧を取得する
 * GET /api/goals?include_kgi=true
 */
export const fetchGoalsWithKgi = () =>
  apiGet<{ success: boolean; data: GoalWithKgi[] }>('/api/goals?include_kgi=true')

// ─── KPI API ────────────────────────────────────────────────

/**
 * KPI を作成する
 * POST /api/kpis
 */
export const createKpi = (req: CreateKpiRequest) =>
  apiPost<{ success: boolean; data: Kpi }>('/api/kpis', req)

/**
 * 指定 Goal に紐づく KPI 一覧を取得する
 * GET /api/kpis?goal_id={goal_id}
 */
export const fetchKpis = (goalId: string) =>
  apiGet<{ success: boolean; data: Kpi[] }>(`/api/kpis?goal_id=${goalId}`)

/**
 * 今日の KPI 一覧（記録状況付き）を取得する
 * GET /api/kpis/today
 */
export const fetchKpisToday = () =>
  apiGet<KpiTodayApiResponse>('/api/kpis/today')

/**
 * KPI ログを登録または更新する（upsert）
 * PUT /api/kpis/{kpi_id}/logs
 */
export const upsertKpiLog = (kpiId: string, req: UpsertKpiLogRequest) =>
  apiPut<KpiLogApiResponse>(`/api/kpis/${kpiId}/logs`, req)

/**
 * KPI のグラフデータを取得する
 * GET /api/kpis/{kpi_id}/logs?granularity=daily&range=30d
 */
export const fetchKpiLogs = (
  kpiId: string,
  granularity: 'daily' | 'weekly' | 'monthly',
  range?: string,
) => {
  const params = new URLSearchParams({ granularity })
  if (range) params.set('range', range)
  return apiGet<KpiChartApiResponse>(`/api/kpis/${kpiId}/logs?${params.toString()}`)
}

/**
 * KPI に習慣を紐づける（全上書き）
 * POST /api/kpis/{kpi_id}/habits
 */
export const linkKpiHabits = (kpiId: string, habitIds: string[]) =>
  apiPost<{ success: boolean; data: { kpi_id: string; habit_ids: string[] } }>(
    `/api/kpis/${kpiId}/habits`,
    { habit_ids: habitIds },
  )

/**
 * KPI を削除する（soft delete）
 * DELETE /api/kpis/{kpi_id}
 */
export const deleteKpi = (kpiId: string) =>
  apiDelete<{ success: boolean; data: { kpi_id: string } }>(`/api/kpis/${kpiId}`)

// ============================================================
// Wanna Be API クライアント (Sprint 2)
// ============================================================

/**
 * 現在有効な Wanna Be を取得する
 * GET /api/wanna-be
 * 未登録の場合は null を返す（204 No Content）
 */
export const getWannaBe = async (): Promise<{ text: string } | null> => {
  try {
    const response = await api.get<{ success: boolean; data: { text: string } }>('/api/wanna-be')
    if (response.status === 204) return null
    return response.data?.data ?? null
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status?: number } }
      if (axiosErr.response?.status === 204) return null
    }
    throw err
  }
}

/**
 * Wanna Be を保存する（SSE ストリーミングをトリガーするが応答は捨てる）
 * POST /api/wanna-be/analyze
 */
export const saveWannaBe = async (text: string): Promise<void> => {
  // analyze エンドポイントは SSE ストリームを返すが、保存目的のみのため fetch で fire-and-forget
  const token = getStoredAccessToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  await fetch(`${API_BASE_URL}/api/wanna-be/analyze`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text }),
  })
}

// ============================================================
// Goals API クライアント (Sprint 2)
// ============================================================

/**
 * アクティブな長期目標一覧を取得する
 * GET /api/goals
 */
export const getGoals = async (): Promise<Array<{ id: string; title: string }>> => {
  try {
    const response = await apiGet<{ success: boolean; data: Array<{ id: string; title: string }> }>('/api/goals')
    return response.data ?? []
  } catch {
    return []
  }
}

/**
 * 長期目標を保存する（既存を非活性化して新規 INSERT）
 * POST /api/goals
 */
export const saveGoals = async (goals: Array<{ title: string }>): Promise<void> => {
  await apiPost('/api/goals', { goals })
}

// ============================================================
// Mandala API クライアント (Sprint 2)
// ============================================================

/**
 * 認証ユーザーの最新マンダラを取得する
 * GET /api/mandala
 * 未登録の場合は null を返す（204 No Content）
 */
export const getMandala = async (): Promise<{ cells: unknown } | null> => {
  try {
    const response = await api.get<{ success: boolean; data: { cells: unknown } }>('/api/mandala')
    if (response.status === 204) return null
    return response.data?.data ?? null
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { status?: number } }
      if (axiosErr.response?.status === 204) return null
    }
    throw err
  }
}

/**
 * マンダラを保存する（upsert: 1ユーザー1レコード）
 * POST /api/mandala
 */
export const saveMandala = async (cells: unknown): Promise<void> => {
  await apiPost('/api/mandala', { cells })
}

// ============================================================
// Habits API クライアント
// ============================================================

export interface HabitItem {
  id: string
  title: string
  wanna_be_connection_text?: string | null
  current_streak?: number
  today_log?: { completed: boolean } | null
}

/**
 * アクティブな習慣一覧を取得する（今日のログ付き）
 * GET /api/habits
 */
export const getHabits = async (): Promise<HabitItem[]> => {
  try {
    const response = await apiGet<{ success: boolean; data: HabitItem[] }>('/api/habits')
    return response.data ?? []
  } catch {
    return []
  }
}

/**
 * 習慣を作成する
 * POST /api/habits
 */
export const createHabit = async (title: string, wannaBeConnectionText?: string): Promise<HabitItem> => {
  const body: Record<string, unknown> = { title }
  if (wannaBeConnectionText) body.wanna_be_connection_text = wannaBeConnectionText
  const response = await apiPost<{ success: boolean; data: HabitItem }>('/api/habits', body)
  return response.data
}

/**
 * 習慣ログを記録する
 * PATCH /api/habits/{habit_id}/log
 */
export const logHabit = async (habitId: string, completed: boolean): Promise<void> => {
  await apiPatch(`/api/habits/${habitId}/log`, { completed })
}
