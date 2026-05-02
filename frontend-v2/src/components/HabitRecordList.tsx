// ============================================================
// HabitRecordList — レコード画面（朝/夜）の習慣チェック・記録UI
//
// /api/habits の today_log を初期値とし、ユーザー入力で PATCH /log を
// 飛ばす。metric_type に応じてチェック / 数値 / 時刻の入力ボックスを
// 切り替える。
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { logHabit } from '@/lib/api'
import { useHabits } from '@/lib/useHabits'
import {
  isNumericMetric,
  isTimeMetric,
  type Habit,
  type UpdateHabitLogRequest,
} from '@/types/habit'

interface Props {
  dateKey: string  // YYYY-MM-DD
  isReadOnly?: boolean
}

const HABIT_ACCENT = '#7dd3fc'

export const HabitRecordList = ({ dateKey, isReadOnly = false }: Props) => {
  const { habits, loading, refresh } = useHabits()
  const sorted = useMemo(
    () => [...habits].sort((a, b) => a.display_order - b.display_order),
    [habits],
  )

  if (loading) {
    return (
      <p className="px-3 py-2 text-[11px] text-white/30">読み込み中…</p>
    )
  }

  if (sorted.length === 0) {
    return (
      <p className="px-3 py-2 text-[11px] text-white/35">
        まだ習慣が登録されていません。設定画面 → 習慣化タブから追加できます。
      </p>
    )
  }

  return (
    <section className="mb-4">
      <header className="flex items-center justify-between gap-3 px-1 pb-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: HABIT_ACCENT }} />
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: HABIT_ACCENT }}
          >
            習慣化
          </span>
          <span className="text-[10px] text-white/22">継続トラッキング</span>
        </div>
        <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-mono text-white/30">
          {sorted.filter((h) => h.today_log?.completed).length} / {sorted.length}
        </span>
      </header>
      <div className="space-y-1.5">
        {sorted.map((h) => (
          <HabitRow key={h.id} habit={h} dateKey={dateKey} isReadOnly={isReadOnly} onLogged={refresh} />
        ))}
      </div>
    </section>
  )
}

interface RowProps {
  habit: Habit
  dateKey: string
  isReadOnly: boolean
  onLogged: () => void | Promise<void>
}

const HabitRow = ({ habit, dateKey, isReadOnly, onLogged }: RowProps) => {
  // 数値・時刻はローカル state で編集し、blur / Enter で保存。
  const initialNumeric = habit.today_log?.numeric_value
  const initialTime = habit.today_log?.time_value
  const [numericDraft, setNumericDraft] = useState<string>(
    initialNumeric != null ? String(initialNumeric) : '',
  )
  const [timeDraft, setTimeDraft] = useState<string>(
    initialTime ? initialTime.slice(0, 5) : '',
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 親が refetch したら再同期
  useEffect(() => {
    setNumericDraft(habit.today_log?.numeric_value != null ? String(habit.today_log.numeric_value) : '')
    setTimeDraft(habit.today_log?.time_value ? habit.today_log.time_value.slice(0, 5) : '')
  }, [habit.today_log?.numeric_value, habit.today_log?.time_value])

  const completed = Boolean(habit.today_log?.completed)
  const streak = habit.current_streak ?? 0

  const sendLog = async (overrides: Partial<UpdateHabitLogRequest>) => {
    if (isReadOnly) return
    setPending(true)
    setError(null)
    try {
      const req: UpdateHabitLogRequest = {
        date: dateKey,
        completed: overrides.completed ?? completed,
        input_method: 'manual',
        ...overrides,
      }
      await logHabit(habit.id, req)
      await onLogged()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setPending(false)
    }
  }

  const handleToggleBinary = () => {
    void sendLog({ completed: !completed })
  }

  const handleNumericBlur = () => {
    const v = parseFloat(numericDraft)
    if (Number.isNaN(v)) return
    if (initialNumeric != null && v === Number(initialNumeric)) return
    void sendLog({ numeric_value: v, completed })
  }

  const handleTimeBlur = () => {
    if (!timeDraft) return
    const normalized = timeDraft.length === 5 ? `${timeDraft}:00` : timeDraft
    if (initialTime && normalized === initialTime) return
    void sendLog({ time_value: normalized, completed })
  }

  const targetSummary = formatHabitTarget(habit)
  const displayValue = formatLoggedValue(habit)

  return (
    <div
      className={[
        'rounded-2xl border px-3 py-2.5 transition-colors',
        completed
          ? 'border-[#7dd3fc]/35 bg-[#7dd3fc]/[0.06]'
          : 'border-white/[0.06] bg-white/[0.02]',
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        {/* 達成状態インジケータ（binary はトグル可、それ以外は表示のみ） */}
        {habit.metric_type === 'binary' ? (
          <button
            type="button"
            onClick={handleToggleBinary}
            disabled={isReadOnly || pending}
            aria-label={completed ? '完了を取り消す' : '完了にする'}
            className={[
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors',
              completed
                ? 'border-[#7dd3fc] bg-[#7dd3fc]/20 text-[#7dd3fc]'
                : 'border-white/20 text-transparent hover:border-white/40',
            ].join(' ')}
          >
            ✓
          </button>
        ) : (
          <span
            className={[
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px]',
              completed
                ? 'border-[#7dd3fc] bg-[#7dd3fc]/20 text-[#7dd3fc]'
                : 'border-white/12 text-white/30',
            ].join(' ')}
            aria-label={completed ? '達成' : '未達成'}
          >
            {completed ? '✓' : '·'}
          </span>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/85 truncate">{habit.title}</p>
          <p className="text-[10px] text-white/35">
            {targetSummary}
            {displayValue && (
              <>
                <span className="mx-1.5 text-white/20">/</span>
                <span className="text-white/55">{displayValue}</span>
              </>
            )}
          </p>
        </div>

        {/* 入力UI: 数値 / 時刻 */}
        {isNumericMetric(habit.metric_type) && (
          <div className="flex shrink-0 items-center gap-1.5">
            <input
              type="number"
              value={numericDraft}
              onChange={(e) => setNumericDraft(e.target.value)}
              onBlur={handleNumericBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              disabled={isReadOnly || pending}
              placeholder="—"
              className="w-16 rounded-lg border border-white/[0.08] bg-[#08111c] px-2 py-1 text-right text-[12px] font-mono text-white/85 focus:border-[#7dd3fc]/40 focus:outline-none"
            />
            {habit.unit && (
              <span className="text-[10px] text-white/35">{habit.unit}</span>
            )}
          </div>
        )}
        {isTimeMetric(habit.metric_type) && (
          <input
            type="time"
            value={timeDraft}
            onChange={(e) => setTimeDraft(e.target.value)}
            onBlur={handleTimeBlur}
            disabled={isReadOnly || pending}
            className="shrink-0 rounded-lg border border-white/[0.08] bg-[#08111c] px-2 py-1 text-[12px] font-mono text-white/85 focus:border-[#7dd3fc]/40 focus:outline-none"
          />
        )}

        {streak > 0 && (
          <span className="shrink-0 rounded-full border border-[#fbbf24]/30 bg-[#fbbf24]/10 px-2 py-0.5 text-[10px] text-[#fbbf24]">
            {streak}🔥
          </span>
        )}
      </div>
      {error && (
        <p className="mt-1.5 pl-9 text-[10px] text-[#fca5a5]">{error}</p>
      )}
    </div>
  )
}

const formatHabitTarget = (h: Habit): string => {
  const unit = h.unit ?? ''
  switch (h.metric_type) {
    case 'binary':
      return 'チェック式'
    case 'numeric_min':
      return h.target_value != null ? `≥ ${h.target_value} ${unit}`.trim() : '数値'
    case 'numeric_max':
      return h.target_value != null ? `≤ ${h.target_value} ${unit}`.trim() : '数値'
    case 'duration':
      return h.target_value != null ? `${h.target_value} 分以上` : '時間'
    case 'range':
      return h.target_value != null && h.target_value_max != null
        ? `${h.target_value}〜${h.target_value_max} ${unit}`.trim()
        : '範囲'
    case 'time_before':
      return h.target_time ? `${h.target_time.slice(0, 5)} まで` : '時刻'
    case 'time_after':
      return h.target_time ? `${h.target_time.slice(0, 5)} 以降` : '時刻'
    default:
      return h.metric_type
  }
}

const formatLoggedValue = (h: Habit): string => {
  const log = h.today_log
  if (!log) return ''
  if (log.numeric_value != null) {
    return `${log.numeric_value}${h.unit ? ' ' + h.unit : ''}`
  }
  if (log.time_value) {
    return log.time_value.slice(0, 5)
  }
  return ''
}
