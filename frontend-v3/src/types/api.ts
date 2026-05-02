// Backend response shapes used by frontend-v3.
// Keep in sync with backend/app/models/schemas.py + docs/design/habit-design-app/interfaces.ts.

export interface PrimaryTargetResponse {
  value: string
  set_date: string
  completed: boolean
}

export interface UserContextResponse {
  identity: string | null
  values_keywords: string[] | null
  goal_summary: string | null
  patterns: string[] | null
  insights: string[] | null
  lang: string | null
  granularity: string | null
  display_name: string | null
  avatar_url: string | null
}

export type HabitMetricType =
  | 'binary'
  | 'numeric_min'
  | 'numeric_max'
  | 'duration'
  | 'range'
  | 'time_before'
  | 'time_after'

export type HabitProofType = 'none' | 'photo' | 'auto'

export interface BackendHabit {
  id: string
  user_id: string
  goal_id: string | null
  title: string
  description: string | null
  frequency: string
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
  aggregation: string
  proof_type?: HabitProofType
  source_kind?: string
  xp_base?: number
  created_at?: string
  updated_at?: string
  today_log?: BackendHabitLog | null
}

export interface BackendHabitLog {
  id: string
  habit_id: string
  user_id: string
  log_date: string
  completed: boolean
  completed_at: string | null
  numeric_value: number | null
  time_value: string | null
  proof_url?: string | null
  xp_earned?: number
}
