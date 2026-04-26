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
