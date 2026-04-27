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
} from '@/types'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

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

const apiFetch = async <T>(
  method: string,
  path: string,
  data?: unknown,
): Promise<T> => {
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
    const err = new Error(`${method} ${path} → ${res.status}`)
    ;(err as { status?: number }).status = res.status
    throw err
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }

  return res.json() as Promise<T>
}

export const apiGet    = <T>(url: string)                  => apiFetch<T>('GET',    url)
export const apiPost   = <T>(url: string, data?: unknown)  => apiFetch<T>('POST',   url, data)
export const apiPut    = <T>(url: string, data?: unknown)  => apiFetch<T>('PUT',    url, data)
export const apiPatch  = <T>(url: string, data?: unknown)  => apiFetch<T>('PATCH',  url, data)
export const apiDelete = <T>(url: string)                  => apiFetch<T>('DELETE', url)

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
    const result = await apiGet<{ success: boolean; data: { text: string } } | undefined>('/api/wanna-be')
    return result?.data ?? null
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 204 || status === 404) return null
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
    const result = await apiGet<{ success: boolean; data: { cells: unknown } } | undefined>('/api/mandala')
    return result?.data ?? null
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 204 || status === 404) return null
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

// ============================================================
// Journal API クライアント
// ============================================================

export interface JournalContent {
  primary_target: string
  feedback: string
  tasks: Array<{ label: string; section: string; reason: string }>
}

/**
 * ジャーナルエントリーを保存する（日付+タイプで upsert）
 * POST /api/journals
 */
export const saveJournalEntry = async (params: {
  entry_date: string
  raw_input: string
  content: JournalContent
}): Promise<void> => {
  await apiPost('/api/journals', {
    entry_date: params.entry_date,
    entry_type: 'journaling',
    raw_input: params.raw_input,
    content: JSON.stringify(params.content),
  })
}

/**
 * ジャーナル一覧を取得する（直近 N 件）
 * GET /api/journals
 */
export const fetchJournals = (limit = 30) =>
  apiGet<Array<{ id: string; entry_date: string; content: string; raw_input: string | null; created_at: string }>>(
    `/api/journals?entry_type=journaling&limit=${limit}`,
  )

/**
 * 特定日のジャーナルを取得する
 * GET /api/journals/{date}
 */
export const fetchJournalByDate = (date: string) =>
  apiGet<{ id: string; entry_date: string; content: string; raw_input: string | null } | null>(
    `/api/journals/${date}?entry_type=journaling`,
  )

// ============================================================
// Todo定義 API クライアント
// ============================================================

export interface TodoDefinitionRecord {
  id: string
  label: string
  section: string   // HabitCategory 値
  timing?: string   // HabitTiming 値（新）
  minutes?: number | null
  is_must?: boolean
  is_active: boolean
  display_order?: number
  field_type?: string
  field_options?: Record<string, unknown>
}

/** GET /api/todo-definitions */
export const fetchTodoDefinitions = () =>
  apiGet<TodoDefinitionRecord[]>('/api/todo-definitions')

/** POST /api/todo-definitions — 配列 upsert */
export const saveTodoDefinitions = (items: TodoDefinitionRecord[]) =>
  apiPost<TodoDefinitionRecord[]>('/api/todo-definitions', items)

/** PATCH /api/todo-definitions/{id} — 個別更新 */
export const patchTodoDefinition = (id: string, patch: Partial<TodoDefinitionRecord>) =>
  apiPatch<TodoDefinitionRecord>(`/api/todo-definitions/${id}`, patch)

// ============================================================
// Daily Logs API クライアント
// ============================================================

export interface DailyLogEntry {
  slot: string
  field: string
  value: unknown
}

/**
 * 日次ログを取得する
 * GET /api/daily-logs?date={YYYY-MM-DD}&slot={morning|evening}
 */
export const fetchDailyLogs = (date: string, slot: string): Promise<DailyLogEntry[]> =>
  apiGet<DailyLogEntry[]>(`/api/daily-logs?date=${date}&slot=${slot}`)

/**
 * 日次ログをバッチ upsert する
 * POST /api/daily-logs
 */
export const saveDailyLog = (
  entries: Array<{ log_date: string; slot: string; field: string; value: unknown }>,
): Promise<void> => apiPost('/api/daily-logs', entries)

// ============================================================
// Ops Tasks API クライアント
// ============================================================

export interface OpsTaskRecord {
  id: string
  title: string
  done: boolean
  createdAt?: string
  created_at?: string
}

/**
 * オペレーションタスクを取得する
 * GET /api/ops-tasks?date={YYYY-MM-DD}
 */
export const fetchOpsTasks = (date: string): Promise<OpsTaskRecord[]> =>
  apiGet<OpsTaskRecord[]>(`/api/ops-tasks?date=${date}`)

/**
 * オペレーションタスクを一括保存する
 * POST /api/ops-tasks
 */
export const saveOpsTasks = (
  tasks: Array<{ id: string; title: string; done: boolean; createdAt?: string }>,
  taskDate: string,
): Promise<void> =>
  apiPost('/api/ops-tasks', tasks.map(t => ({ ...t, task_date: taskDate })))

/**
 * 単一オペレーションタスクの done 状態を更新する
 * PATCH /api/ops-tasks/{id}
 */
export const patchOpsTask = (id: string, taskDate: string, done: boolean): Promise<void> =>
  apiPatch(`/api/ops-tasks/${id}`, { done, task_date: taskDate })

// ============================================================
// Primary Target API クライアント
// ============================================================

export interface PrimaryTargetRecord {
  value: string
  set_date: string
  completed: boolean
}

/**
 * Primary Target を取得する
 * GET /api/primary-target
 */
export const fetchPrimaryTarget = (): Promise<PrimaryTargetRecord | null> =>
  apiGet<PrimaryTargetRecord | null>('/api/primary-target')

/**
 * Primary Target を保存する
 * PUT /api/primary-target
 */
export const savePrimaryTarget = (data: PrimaryTargetRecord): Promise<void> =>
  apiPut('/api/primary-target', data)

// ============================================================
// Monthly Targets API クライアント
// ============================================================

/**
 * 月次目標を取得する
 * GET /api/monthly-targets?year_month={YYYY-MM}
 */
export const fetchMonthlyTargets = async (yearMonth: string): Promise<Record<string, number>> => {
  const result = await apiGet<{ targets: Record<string, number> }>(
    `/api/monthly-targets?year_month=${yearMonth}`,
  )
  return result.targets ?? {}
}

/**
 * 月次目標を保存する
 * PUT /api/monthly-targets
 */
export const saveMonthlyTargets = (
  yearMonth: string,
  targets: Record<string, number>,
): Promise<void> => apiPut('/api/monthly-targets', { year_month: yearMonth, targets })

// ============================================================
// User Context API クライアント
// ============================================================

export interface UserContext {
  identity?: string
  values_keywords?: string[]
  goal_summary?: string
  patterns?: string
  insights?: Record<string, unknown>
  lang?: 'ja' | 'en'
  granularity?: string
}

/**
 * ユーザーコンテキストを取得する
 * GET /api/user-context
 */
export const fetchUserContext = (): Promise<UserContext | null> =>
  apiGet<UserContext | null>('/api/user-context')

/**
 * ユーザーコンテキストを部分更新する
 * PATCH /api/user-context
 */
export const patchUserContext = (patch: Partial<UserContext>): Promise<UserContext> =>
  apiPatch<UserContext>('/api/user-context', patch)

// ============================================================
// Integrations API クライアント（iOS Shortcuts Webhook）
// ============================================================

export interface HealthLog {
  id: string
  metric: string
  value: number
  unit?: string
  recorded_at: string
}

/**
 * 健康データログ一覧を取得する
 * GET /api/integrations/logs
 */
export const fetchHealthLogs = (date?: string): Promise<HealthLog[]> => {
  const params = date ? `?date=${date}` : ''
  return apiGet<HealthLog[]>(`/api/integrations/logs${params}`)
}
