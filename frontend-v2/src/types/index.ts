// ============================================================
// Daily OS v2 — 型定義
// ============================================================

export type HabitCategory = 'must' | 'routine'
export type TabId = 'home' | 'morning' | 'evening' | 'monthly' | 'wanna-be' | 'report' | 'more' | 'settings' | 'journal' | 'notes' | 'calendar'

export interface Habit {
  id: string
  title: string
  category: HabitCategory        // must=勝利項目 / routine=準備ルーティン
  time_slot: 'morning' | 'evening' | 'anytime'
  order_index: number
  estimated_minutes: number | null
  target_frequency_per_month: number | null  // 月間目標回数
  is_active: boolean
}

export interface HabitLog {
  id: string
  habit_id: string
  log_date: string               // YYYY-MM-DD
  completed: boolean
  duration_minutes: number | null
  note: string | null
}

export interface DailyBoss {
  id: string
  date: string                   // YYYY-MM-DD
  task: string                   // 今日の最重要タスク
  completed: boolean
}

export interface WeightLog {
  id: string
  date: string
  slot: 'morning' | 'evening'
  weight_kg: number
}

export interface ConditionLog {
  id: string
  date: string
  slot: 'morning' | 'evening'
  stars: 1 | 2 | 3 | 4 | 5
}

export interface WannaBe {
  id: string
  title: string
  emoji: string | null
  sub_text: string | null        // → 習慣への接続テキスト
  priority: 'critical' | 'high' | 'done'
  order_index: number
}

export interface DailyReport {
  id: string
  date: string
  slot: 'morning' | 'evening'
  body: string                   // 生成されたテキスト
  created_at: string
}

// API レスポンス汎用
export interface ApiResponse<T> {
  data: T
  message?: string
}

// ============================================================
// KGI/KPI 型定義 (TASK-0034)
// ============================================================

// ─── Enum-like string unions ────────────────────────────────

export type MetricType = 'numeric' | 'percentage' | 'binary'
export type TrackingFrequency = 'daily' | 'weekly' | 'monthly'
export type KpiInputMethod = 'manual' | 'voice' | 'auto'

// ─── KGI (Key Goal Indicator) ───────────────────────────────

/** Goal を KGI として設定した場合の拡張型 */
export interface GoalWithKgi {
  id: string
  user_id: string
  wanna_be_id?: string
  title: string
  description?: string
  display_order: number
  is_active: boolean
  is_kgi: boolean
  // KGI 固有フィールド（is_kgi=true の場合のみ意味を持つ）
  target_value?: number
  current_value?: number
  unit?: string
  target_date?: string          // YYYY-MM-DD
  metric_type?: MetricType
  // 算出フィールド（バックエンドが計算して返す）
  achievement_rate?: number     // 0〜100 (%)
  days_remaining?: number       // 負の場合は超過日数
  is_expired?: boolean
  created_at: string
  updated_at: string
}

export interface SetKgiRequest {
  target_value?: number
  current_value?: number
  unit?: string
  target_date: string           // 必須
  metric_type: MetricType
}

export interface UpdateKgiCurrentValueRequest {
  current_value: number
}

// ─── KPI (Key Performance Indicator) ────────────────────────

export interface Kpi {
  id: string
  user_id: string
  goal_id: string
  title: string
  description?: string
  metric_type: MetricType
  target_value?: number
  unit?: string
  tracking_frequency: TrackingFrequency
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
  habit_ids?: string[]
}

export interface CreateKpiRequest {
  goal_id: string
  title: string
  description?: string
  metric_type: MetricType
  target_value?: number
  unit?: string
  tracking_frequency: TrackingFrequency
  display_order?: number
}

// ─── KPI Log ────────────────────────────────────────────────

export interface KpiLog {
  id: string
  kpi_id: string
  user_id: string
  log_date: string              // YYYY-MM-DD
  value: number
  input_method: KpiInputMethod
  note?: string
  created_at: string
}

export interface UpsertKpiLogRequest {
  log_date: string              // YYYY-MM-DD
  value: number
  input_method?: KpiInputMethod
  note?: string
}

// ─── KPI Chart ──────────────────────────────────────────────

export interface KpiChartDataPoint {
  date: string                  // YYYY-MM-DD (日次) / 週開始日 (週次) / YYYY-MM (月次)
  value: number | null
}

export interface KpiChartSummary {
  avg?: number | null
  max?: number | null
  min?: number | null
  latest_value?: number | null
  target_value?: number | null
}

export interface KpiChartResponse {
  kpi_id: string
  granularity: 'daily' | 'weekly' | 'monthly'
  data_points: KpiChartDataPoint[]
  summary: KpiChartSummary
}

// ─── KPI with today status ───────────────────────────────────

export interface KpiWithTodayStatus extends Kpi {
  today_completed: boolean
  today_value: number | null
  connected_habits: Array<{ habit_id: string; habit_title?: string }>
}

// ─── Voice / Weekly summary ──────────────────────────────────

export interface VoiceKpiUpdateResponse {
  success: boolean
  updated_kpis: Array<{
    kpi_id: string
    kpi_title: string
    value: number
    log: KpiLog
  }>
  raw_transcript?: string
}

export interface WeeklyKgiSummary {
  goal_id: string
  goal_title: string
  kgi: GoalWithKgi
  kpis: Array<{
    kpi: Kpi
    week_logs: KpiLog[]
    week_average?: number
    week_completion_rate?: number
  }>
  overall_achievement_rate: number
}

// ─── API レスポンス型エイリアス ──────────────────────────────

export interface KgiApiResponse {
  success: boolean
  data: GoalWithKgi
}

export interface KgiListApiResponse {
  success: boolean
  data: GoalWithKgi[]
}

export interface KpiApiResponse {
  success: boolean
  data: Kpi
}

export interface KpiListApiResponse {
  success: boolean
  data: Kpi[]
}

export interface KpiTodayApiResponse {
  success: boolean
  data: KpiWithTodayStatus[]
}

export interface KpiLogApiResponse {
  success: boolean
  data: KpiLog
}

export interface KpiChartApiResponse {
  success: boolean
  data: KpiChartResponse
}
