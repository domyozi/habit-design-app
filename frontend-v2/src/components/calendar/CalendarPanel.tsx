import { useState, useEffect, useCallback } from 'react'
import { WeeklyCalendar, slotToDateTime } from './WeeklyCalendar'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import type { TodoDefinition, HabitCategory } from '@/lib/todos'
import { HABIT_CATEGORIES } from '@/lib/todos'

const SECTION_ACCENT: Record<HabitCategory, string> = {
  identity: '#ff6b35',
  growth: '#22c55e',
  body: '#38bdf8',
  mind: '#a78bfa',
  system: '#f59e0b',
}

function getMondayOfWeek(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

interface ConfirmState {
  taskLabel: string
  startDateTime: string
  duration: number
}

interface Props {
  todoDefinitions: TodoDefinition[]
  onClose: () => void
}

export function CalendarPanel({ todoDefinitions, onClose }: Props) {
  const { isConnected, connect, disconnect, fetchEvents, createEvent, events, loading } = useGoogleCalendar()
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(new Date()))
  const [draggedTask, setDraggedTask] = useState<{ id: string; label: string } | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [creating, setCreating] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [durationInput, setDurationInput] = useState(60)

  useEffect(() => {
    if (isConnected) {
      void fetchEvents(weekStart)
    }
  }, [isConnected, weekStart, fetchEvents])

  const activeTasks = todoDefinitions.filter(t => t.is_active)

  const prevWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d)
  }

  const nextWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d)
  }

  const handleDrop = useCallback(({ dayIndex, slotIndex }: { dayIndex: number; slotIndex: number }) => {
    if (!draggedTask) return
    const startDateTime = slotToDateTime(weekStart, dayIndex, slotIndex)
    setConfirm({ taskLabel: draggedTask.label, startDateTime, duration: durationInput })
    setDraggedTask(null)
  }, [draggedTask, weekStart, durationInput])

  const handleConfirm = async () => {
    if (!confirm) return
    setCreating(true)
    try {
      await createEvent(confirm.taskLabel, confirm.startDateTime, confirm.duration)
      setSuccessMsg(`「${confirm.taskLabel}」をカレンダーに登録しました`)
      setConfirm(null)
      setTimeout(() => setSuccessMsg(null), 3000)
      void fetchEvents(weekStart)
    } catch {
      alert('予定の作成に失敗しました。もう一度試してください。')
    } finally {
      setCreating(false)
    }
  }

  const formatDateTime = (iso: string) => {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const weekLabel = (() => {
    const end = new Date(weekStart)
    end.setDate(end.getDate() + 6)
    return `${weekStart.getMonth() + 1}/${weekStart.getDate()} 〜 ${end.getMonth() + 1}/${end.getDate()}`
  })()

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative flex w-full max-w-5xl flex-col bg-[#07111d]/98 shadow-2xl ring-1 ring-white/[0.08]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-lg">📅</span>
            <div>
              <p className="text-sm font-semibold text-white/88">Googleカレンダーで計画</p>
              <p className="text-[10px] text-white/36">タスクをドラッグして予定を登録</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isConnected && (
              <button
                type="button"
                onClick={disconnect}
                className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-[10px] text-white/36 hover:text-white/60 transition-colors"
              >
                連携解除
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/36 hover:text-white/80 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {!isConnected ? (
          /* Connect screen */
          <div className="flex flex-1 flex-col items-center justify-center gap-6 p-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#7dd3fc]/10 text-3xl">📅</div>
            <div className="text-center">
              <p className="text-base font-semibold text-white/88">Googleカレンダーに接続</p>
              <p className="mt-2 max-w-sm text-sm text-white/50 leading-relaxed">
                タスクをドラッグ&ドロップして週のスケジュールを立てられます。<br />
                Googleアカウントでの認証が必要です。
              </p>
            </div>
            <button
              type="button"
              onClick={connect}
              className="flex items-center gap-2.5 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-[#1a1a1a] shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Googleアカウントで連携
            </button>
          </div>
        ) : (
          /* Main layout */
          <div className="flex flex-1 overflow-hidden">

            {/* Left: Task list */}
            <div className="flex w-56 shrink-0 flex-col border-r border-white/[0.06]">
              <div className="border-b border-white/[0.06] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/36">タスク一覧</p>
                <p className="mt-1 text-[9px] text-white/24">ドラッグしてカレンダーへ</p>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {HABIT_CATEGORIES.map(cat => {
                  const tasks = activeTasks.filter(t => t.section === cat.id)
                  if (tasks.length === 0) return null
                  return (
                    <div key={cat.id}>
                      <p className="mb-1 mt-2 text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: `${SECTION_ACCENT[cat.id]}99` }}>
                        {cat.label}
                      </p>
                      {tasks.map(task => (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={() => setDraggedTask({ id: task.id, label: task.label })}
                          onDragEnd={() => setDraggedTask(null)}
                          className="flex cursor-grab items-center gap-2 rounded-lg border border-white/[0.04] bg-white/[0.02] px-2.5 py-2 text-xs text-white/72 transition-colors hover:border-white/[0.10] hover:bg-white/[0.05] active:cursor-grabbing"
                        >
                          <span className="text-[10px]" style={{ color: `${SECTION_ACCENT[cat.id]}cc` }}>⠿</span>
                          <span className="truncate leading-snug">{task.label}</span>
                          {task.minutes && (
                            <span className="ml-auto shrink-0 text-[9px] text-white/28">{task.minutes}m</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>

              {/* Duration selector */}
              <div className="border-t border-white/[0.06] p-3">
                <p className="mb-1.5 text-[9px] text-white/36">予定の長さ</p>
                <div className="flex flex-wrap gap-1">
                  {[30, 60, 90, 120].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDurationInput(m)}
                      className={[
                        'rounded-md border px-2 py-1 text-[10px] transition-colors',
                        durationInput === m
                          ? 'border-[#7dd3fc]/40 bg-[#7dd3fc]/10 text-[#7dd3fc]'
                          : 'border-white/[0.06] text-white/36 hover:text-white/60',
                      ].join(' ')}
                    >
                      {m >= 60 ? `${m / 60}h` : `${m}m`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Calendar */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Week nav */}
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
                <button type="button" onClick={prevWeek} className="rounded-lg px-2.5 py-1.5 text-xs text-white/40 hover:text-white/80 transition-colors">
                  ← 前週
                </button>
                <p className="text-xs font-semibold text-white/60">{weekLabel}</p>
                <button type="button" onClick={nextWeek} className="rounded-lg px-2.5 py-1.5 text-xs text-white/40 hover:text-white/80 transition-colors">
                  次週 →
                </button>
              </div>

              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#07111d]/60 z-20">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-[#7dd3fc]/60" />
                </div>
              )}

              <div className="relative flex-1 overflow-hidden">
                <WeeklyCalendar
                  weekStart={weekStart}
                  events={events}
                  onDrop={handleDrop}
                  draggedTask={draggedTask}
                />
              </div>
            </div>
          </div>
        )}

        {/* Success toast */}
        {successMsg && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-xl border border-[#22c55e]/30 bg-[#0d1f13]/95 px-5 py-3 text-sm text-[#86efac] shadow-xl backdrop-blur-xl">
            ✓ {successMsg}
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      {confirm && (
        <div className="absolute inset-0 z-60 flex items-center justify-center bg-black/50">
          <div className="w-80 rounded-2xl border border-white/[0.12] bg-[#0d1825]/98 p-6 shadow-2xl backdrop-blur-xl">
            <p className="text-sm font-semibold text-white/88">予定を登録しますか？</p>
            <div className="mt-4 space-y-2 rounded-xl bg-white/[0.04] p-3">
              <div className="flex items-start gap-2 text-xs">
                <span className="shrink-0 text-white/36">タイトル</span>
                <span className="text-white/80">{confirm.taskLabel}</span>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <span className="shrink-0 text-white/36">日時</span>
                <span className="text-white/80">{formatDateTime(confirm.startDateTime)}</span>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <span className="shrink-0 text-white/36">所要時間</span>
                <span className="text-white/80">
                  {confirm.duration >= 60 ? `${confirm.duration / 60}時間` : `${confirm.duration}分`}
                </span>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={creating}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#7dd3fc]/15 py-2.5 text-sm font-semibold text-[#7dd3fc] transition-colors hover:bg-[#7dd3fc]/22 disabled:opacity-50"
              >
                {creating ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#7dd3fc]/20 border-t-[#7dd3fc]" />
                ) : '📅'}
                登録する
              </button>
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={creating}
                className="rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm text-white/40 hover:text-white/70 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
