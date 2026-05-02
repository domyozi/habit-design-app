// ============================================================
// HabitMonthlyOverview — 分析画面（MonthlyTab）用の Habit DB ベース概要
//
// 今月の habit_logs を一括取得し、各 habit の達成日数 / monthly_target に
// 対する達成率を簡易リング表示する。
// metric_type ごとに達成判定が違うため、フロント側で is_achieved 相当の
// ロジックを再実装する（バックエンドの app/services/streak_service.py と
// 同じ規則）。
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { fetchHabitLogs } from '@/lib/api'
import { useHabits } from '@/lib/useHabits'
import {
  isNumericMetric,
  isTimeMetric,
  type Habit,
  type HabitLog,
} from '@/types/habit'

const DEFAULT_MONTHLY_TARGET = 20

const isAchieved = (habit: Habit, log: HabitLog): boolean => {
  switch (habit.metric_type) {
    case 'binary':
      return Boolean(log.completed)
    case 'numeric_min':
    case 'duration': {
      if (log.numeric_value == null || habit.target_value == null) return false
      return Number(log.numeric_value) >= Number(habit.target_value)
    }
    case 'numeric_max': {
      if (log.numeric_value == null || habit.target_value == null) return false
      return Number(log.numeric_value) <= Number(habit.target_value)
    }
    case 'range': {
      if (
        log.numeric_value == null ||
        habit.target_value == null ||
        habit.target_value_max == null
      )
        return false
      const v = Number(log.numeric_value)
      return Number(habit.target_value) <= v && v <= Number(habit.target_value_max)
    }
    case 'time_before': {
      if (!log.time_value || !habit.target_time) return false
      return log.time_value <= habit.target_time
    }
    case 'time_after': {
      if (!log.time_value || !habit.target_time) return false
      return log.time_value >= habit.target_time
    }
    default:
      return false
  }
}

const monthBounds = (today: Date): { from: string; to: string } => {
  const y = today.getFullYear()
  const m = today.getMonth()
  const fromDate = new Date(y, m, 1)
  const toDate = new Date(y, m + 1, 0)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { from: fmt(fromDate), to: fmt(toDate) }
}

interface HabitMonthlyStats {
  habit: Habit
  achievedDays: number
  target: number
  pct: number
  totalNumeric?: number
}

const HABIT_COLORS = [
  '#fcd34d',
  '#fb7185',
  '#a78bfa',
  '#60a5fa',
  '#34d399',
  '#f59e0b',
  '#22d3ee',
  '#f472b6',
]

export const HabitMonthlyOverview = () => {
  const { habits, loading: habitsLoading } = useHabits()
  const [logs, setLogs] = useState<HabitLog[]>([])
  const [logsLoading, setLogsLoading] = useState(true)

  useEffect(() => {
    let canceled = false
    const { from, to } = monthBounds(new Date())
    setLogsLoading(true)
    fetchHabitLogs(from, to)
      .then((data) => {
        if (!canceled) setLogs(data)
      })
      .finally(() => {
        if (!canceled) setLogsLoading(false)
      })
    return () => {
      canceled = true
    }
  }, [])

  const stats = useMemo<HabitMonthlyStats[]>(() => {
    const byHabit = new Map<string, HabitLog[]>()
    for (const log of logs) {
      const arr = byHabit.get(log.habit_id) ?? []
      arr.push(log)
      byHabit.set(log.habit_id, arr)
    }
    return habits.map((h) => {
      const habitLogs = byHabit.get(h.id) ?? []
      const achievedDays = habitLogs.filter((l) => isAchieved(h, l)).length
      const target = DEFAULT_MONTHLY_TARGET
      const pct = Math.min(100, Math.round((achievedDays / target) * 100))
      const totalNumeric = isNumericMetric(h.metric_type)
        ? habitLogs.reduce(
            (sum, l) => sum + (l.numeric_value != null ? Number(l.numeric_value) : 0),
            0,
          )
        : undefined
      return { habit: h, achievedDays, target, pct, totalNumeric }
    })
  }, [habits, logs])

  if (habitsLoading || logsLoading) {
    return (
      <div className="rounded-[28px] border border-white/[0.06] bg-[#0b1320]/80 px-5 py-4">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">読み込み中…</p>
      </div>
    )
  }

  if (habits.length === 0) {
    return (
      <div className="rounded-[28px] border border-white/[0.06] bg-[#0b1320]/80 px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7dd3fc]">
          Habit DB
        </p>
        <p className="mt-1 text-[12px] text-white/55">
          まだ習慣が登録されていません。設定画面から追加すると、ここに月次の達成度が出ます。
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[28px] border border-white/[0.06] bg-[#0b1320]/80 px-5 py-4">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7dd3fc]">
            Habit DB / 今月の達成
          </p>
          <p className="mt-1 text-[12px] text-white/45">
            metric_type に応じて達成判定（チェック / 数値 ≥ 目標 / 時刻 ≤ 目標 等）。
          </p>
        </div>
      </header>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {stats.map((s, i) => (
          <HabitRing key={s.habit.id} stats={s} color={HABIT_COLORS[i % HABIT_COLORS.length]} />
        ))}
      </div>
    </div>
  )
}

const HabitRing = ({ stats, color }: { stats: HabitMonthlyStats; color: string }) => {
  const { habit, achievedDays, target, pct } = stats
  const radius = 26
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - pct / 100)
  const unitSuffix = isNumericMetric(habit.metric_type) ? `日` : isTimeMetric(habit.metric_type) ? `日` : `日`

  return (
    <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/[0.02] px-2 py-3">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={radius} stroke="rgba(255,255,255,0.05)" strokeWidth={4} fill="none" />
          <circle
            cx="32"
            cy="32"
            r={radius}
            stroke={color}
            strokeWidth={4}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-bold text-white" style={{ color }}>
            {achievedDays}
          </span>
          <span className="text-[8px] text-white/40">/ {target}{unitSuffix}</span>
        </div>
      </div>
      <p className="text-center text-[11px] leading-tight text-white/72 line-clamp-2">{habit.title}</p>
      {stats.totalNumeric != null && stats.totalNumeric > 0 && (
        <p className="text-[9px] text-white/35">
          累計 {stats.totalNumeric}
          {habit.unit ? ` ${habit.unit}` : ''}
        </p>
      )}
    </div>
  )
}
