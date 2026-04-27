/**
 * 習慣リストコンポーネント
 * TASK-0014: ダッシュボード画面実装
 * Design: AIDesigner dark premium — glass cards with emerald accent
 *
 * 各習慣に以下を表示:
 * - 習慣タイトル
 * - Wanna Be接続文（wanna_be_connection_text）
 * - ストリーク日数（🔥N日連続）
 * - チェックボックス（タップ領域44×44px）
 * - 予定時刻（scheduled_time）
 *
 * 🔵 信頼性レベル: REQ-205/306/502/NFR-202 より
 */
import { useNavigate } from 'react-router-dom'

interface HabitWithTodayStatus {
  id: string
  title: string
  current_streak: number
  scheduled_time: string | null
  wanna_be_connection_text: string | null
  today_completed: boolean
  today_log: { completed: boolean; log_date: string } | null
  is_active: boolean
}

interface HabitListProps {
  habits: HabitWithTodayStatus[]
  onToggle?: (habitId: string, completed: boolean) => void
}

const HabitCard = ({
  habit,
  onToggle,
}: {
  habit: HabitWithTodayStatus
  onToggle?: (habitId: string, completed: boolean) => void
}) => {
  const isCompleted = habit.today_completed || habit.today_log?.completed === true

  return (
    <div
      className={[
        'relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 transition-all',
        'border backdrop-blur-[24px]',
        isCompleted
          ? 'border-white/8 bg-gradient-to-r from-emerald-500/[0.06] to-transparent'
          : 'border-white/8 bg-white/[0.04] hover:bg-white/[0.07]',
      ].join(' ')}
      style={{ WebkitBackdropFilter: 'blur(24px)' }}
    >
      {/* 達成インジケーター（左端ライン） */}
      {isCompleted && (
        <div className="absolute left-0 top-1/4 h-1/2 w-[3px] rounded-r-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
      )}

      {/* チェックボックス（タップ領域44×44px - NFR-202） */}
      <button
        type="button"
        data-testid={`habit-check-${habit.id}`}
        aria-label={`${habit.title}を${isCompleted ? '未達成' : '達成'}にする`}
        className={[
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] transition-all',
          isCompleted
            ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]'
            : 'border border-white/25 bg-black/20 hover:border-emerald-400/50',
        ].join(' ')}
        onClick={() => onToggle?.(habit.id, !isCompleted)}
      >
        {isCompleted && (
          <svg className="h-4 w-4 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* 習慣情報 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={[
            'text-sm font-semibold',
            isCompleted ? 'text-slate-400 line-through decoration-emerald-500/50 decoration-2' : 'text-white',
          ].join(' ')}>
            {habit.title}
          </p>
          {habit.scheduled_time && (
            <span className={[
              'flex shrink-0 items-center gap-1 text-xs',
              isCompleted ? 'text-slate-500' : 'text-emerald-400',
            ].join(' ')}>
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
              </svg>
              {habit.scheduled_time}
            </span>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          {/* Wanna Be接続文（REQ-205） */}
          {habit.wanna_be_connection_text && (
            <span className="text-xs font-medium text-sky-300">
              {habit.wanna_be_connection_text}
            </span>
          )}
          {/* ストリーク（REQ-502） */}
          {habit.current_streak > 0 && (
            <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-xs font-semibold text-slate-200">
              🔥 {habit.current_streak}日連続
            </span>
          )}
          {habit.current_streak === 0 && (
            <span className="text-xs text-slate-400">New</span>
          )}
        </div>
      </div>
    </div>
  )
}

const EmptyHabits = () => {
  const navigate = useNavigate()
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] px-6 py-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
        <svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      </div>
      <p className="mb-1 text-sm font-semibold text-slate-200">まだ習慣がありません</p>
      <p className="mb-5 text-xs leading-relaxed text-slate-500">
        「なりたい自分」を設定すると<br />AIが習慣を自動で提案します
      </p>
      <button
        type="button"
        onClick={() => navigate('/wanna-be')}
        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/30 transition-colors hover:bg-emerald-500/30"
      >
        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
        </svg>
        Wanna Be を設定する
      </button>
    </div>
  )
}

export const HabitList = ({ habits, onToggle }: HabitListProps) => {
  if (habits.length === 0) {
    return <EmptyHabits />
  }

  return (
    <ul className="space-y-3" role="list">
      {habits.map((habit) => (
        <li key={habit.id}>
          <HabitCard habit={habit} onToggle={onToggle} />
        </li>
      ))}
    </ul>
  )
}
