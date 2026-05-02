// Adapt the backend Habit shape to the mock-data shape consumed by
// HabitsTable / MiniGraph / TodayCell so the existing UI works against
// /api/habits without rewriting every component.

import type { BackendHabit, BackendHabitLog, HabitMetricType } from '@/types/api'
import type { Habit, HabitProof, HabitSource, HabitType } from './mockData'

// Map (metric_type, unit) → UI template id.
function deriveType(metric: HabitMetricType, unit: string | null): HabitType {
  if (metric === 'binary') return 'boolean'
  if (metric === 'duration') return 'duration'
  if (metric === 'time_before' || metric === 'time_after') return 'time-target'
  // numeric_min / numeric_max / range — distinguish by unit
  const u = unit ?? ''
  if (u === 'kg' || metric === 'numeric_max') return 'weight'
  if (u === 'km') return 'distance'
  if (u === 'p' || u === 'pages') return 'pages'
  if (u === '点' || u === 'pts') return 'score'
  if (u === '円' || u === '¥') return 'currency'
  if (u === '語' || u === 'words') return 'words'
  return 'count'
}

function deriveSource(sourceKind?: string): HabitSource {
  const known: HabitSource[] = [
    'manual',
    'apple-watch',
    'nike-run',
    'strava',
    'health-app',
    'photo',
    'calendar',
  ]
  return (known as string[]).includes(sourceKind ?? '')
    ? (sourceKind as HabitSource)
    : 'manual'
}

function deriveProof(proofType?: string): HabitProof {
  if (proofType === 'photo' || proofType === 'auto' || proofType === 'none') return proofType
  return 'none'
}

export interface BackendHabitWithLog extends BackendHabit {
  today_log?: BackendHabitLog | null
}

export function adaptHabit(b: BackendHabitWithLog): Habit {
  const type = deriveType(b.metric_type, b.unit)
  const source = deriveSource(b.source_kind)
  const proof = deriveProof(b.proof_type)
  const todayLog = b.today_log

  let goalKind: 'gte' | 'lte' | 'before' | 'done' = 'gte'
  if (b.metric_type === 'binary') goalKind = 'done'
  else if (b.metric_type === 'numeric_max') goalKind = 'lte'
  else if (b.metric_type === 'time_before') goalKind = 'before'

  let todayValue: number | string | boolean = 0
  if (todayLog) {
    if (b.metric_type === 'binary') todayValue = todayLog.completed
    else if (b.metric_type === 'time_before' || b.metric_type === 'time_after')
      todayValue = todayLog.time_value ?? '—'
    else todayValue = todayLog.numeric_value ?? 0
  } else if (b.metric_type === 'binary') {
    todayValue = false
  }

  const goalValue =
    b.metric_type === 'time_before' || b.metric_type === 'time_after'
      ? (b.target_time ?? '')
      : (b.target_value ?? 0)

  return {
    id: b.id,
    label: b.title,
    cat: 'core',
    type,
    unit: b.unit ?? undefined,
    goal: { kind: goalKind, value: goalValue, baseline: undefined, deadline: undefined },
    today: {
      value: todayValue,
      done: todayLog?.completed ?? false,
      viaPhoto: !!todayLog?.proof_url,
      viaAuto: source === 'apple-watch' || source === 'nike-run' || source === 'health-app',
    },
    month: b.current_streak,
    target: 31,
    best: b.longest_streak,
    streak: b.current_streak,
    lagging: false,
    source,
    proof,
    xpBase: b.xp_base ?? 10,
    xpBoost: 0,
    series: [],
  }
}
