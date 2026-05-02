// ============================================================
// Habit 型定義（バックエンド /api/habits + habit_logs 対応）
//
// ソース: docs/design/habit-design-app/interfaces.ts
// バックエンドと同期するため、interfaces.ts の Habit / HabitLog 関連の
// 定義を frontend-v2 側にも複製する。値はサーバーから JSON で来るため
// number / string / null を素直に受ける。
// ============================================================

/**
 * 習慣の指標タイプ。
 *   binary       : completed=true で達成（従来挙動）
 *   numeric_min  : numeric_value >= target_value で達成（読書 ≥ 15分 等）
 *   numeric_max  : numeric_value <= target_value で達成（コーヒー ≤ 2杯 等）
 *   duration     : numeric_min と同等。unit='分' 想定のエイリアス
 *   range        : target_value <= numeric_value <= target_value_max
 *   time_before  : time_value <= target_time（起床 ≤ 07:00 等）
 *   time_after   : time_value >= target_time
 */
export type HabitMetricType =
  | 'binary'
  | 'numeric_min'
  | 'numeric_max'
  | 'duration'
  | 'range'
  | 'time_before'
  | 'time_after'

/** 同日複数ログを集約する関数 */
export type HabitAggregation = 'exists' | 'sum' | 'max' | 'first' | 'avg'

/** 習慣の頻度 */
export type HabitFrequency = 'daily' | 'weekdays' | 'weekends' | 'custom'

/** 習慣ログの入力経路 */
export type HabitInputMethod = 'manual' | 'voice' | 'auto' | 'shortcut'

/** 習慣（ルーティン） */
export interface Habit {
  id: string
  user_id: string
  goal_id: string | null
  title: string
  description: string | null
  frequency: HabitFrequency
  scheduled_time: string | null
  display_order: number
  current_streak: number
  longest_streak: number
  is_active: boolean
  metric_type: HabitMetricType
  target_value: number | null
  target_value_max: number | null
  target_time: string | null
  unit: string | null
  aggregation: HabitAggregation
  wanna_be_connection_text?: string | null
  created_at: string
  updated_at: string
  // JOIN フィールド
  today_log?: HabitLog | null
}

/** 習慣ログ（日次達成記録） */
export interface HabitLog {
  id: string
  habit_id: string
  user_id: string
  log_date: string  // YYYY-MM-DD
  completed: boolean
  completed_at: string | null
  input_method: HabitInputMethod | null
  numeric_value: number | null
  time_value: string | null
  created_at: string
}

// ============================================================
// API リクエスト型
// ============================================================

export interface CreateHabitRequest {
  goal_id?: string
  title: string
  description?: string
  frequency?: HabitFrequency
  scheduled_time?: string
  display_order?: number
  wanna_be_connection_text?: string
  metric_type?: HabitMetricType
  target_value?: number
  target_value_max?: number
  target_time?: string
  unit?: string
  aggregation?: HabitAggregation
}

export type HabitUpdateAction = 'change_time' | 'add_habit' | 'remove_habit' | 'manual_edit'

export interface UpdateHabitRequest {
  action: HabitUpdateAction
  title?: string
  scheduled_time?: string
  goal_id?: string
  display_order?: number
  metric_type?: HabitMetricType
  target_value?: number
  target_value_max?: number
  target_time?: string
  unit?: string
  aggregation?: HabitAggregation
}

export interface UpdateHabitLogRequest {
  date: string  // YYYY-MM-DD
  completed: boolean
  failure_reason?: string
  input_method?: 'manual' | 'voice' | 'shortcut'
  numeric_value?: number
  time_value?: string
}

// ============================================================
// ヘルパー
// ============================================================

/** metric_type が量的（numeric_value を使う）かどうか */
export const isNumericMetric = (t: HabitMetricType): boolean =>
  t === 'numeric_min' || t === 'numeric_max' || t === 'duration' || t === 'range'

/** metric_type が時刻系（time_value を使う）かどうか */
export const isTimeMetric = (t: HabitMetricType): boolean =>
  t === 'time_before' || t === 'time_after'
