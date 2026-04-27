/**
 * 習慣チェックボックスコンポーネント
 * TASK-0015: 習慣チェックリスト操作UI
 *
 * 3状態: 達成（✅）/ 未達成（❌）/ 未記録
 * タップ領域: min-w-[44px] min-h-[44px]（NFR-202）
 * isPending中はdisabled
 *
 * 🔵 信頼性レベル: REQ-404/501/NFR-202 より
 */

interface HabitCheckboxProps {
  habitId: string
  habitTitle: string
  isCompleted: boolean
  isPending: boolean
  onToggle: (habitId: string, completed: boolean) => void
}

export const HabitCheckbox = ({
  habitId,
  habitTitle,
  isCompleted,
  isPending,
  onToggle,
}: HabitCheckboxProps) => {
  return (
    <button
      type="button"
      role="button"
      aria-label={`${habitTitle}を${isCompleted ? '未達成' : '達成'}にする`}
      aria-pressed={isCompleted}
      disabled={isPending}
      className={[
        'flex items-center justify-center rounded-xl border-2 transition-all',
        'min-w-[44px] min-h-[44px]',
        isPending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        isCompleted
          ? 'border-emerald-500 bg-emerald-500'
          : 'border-slate-300 bg-white hover:border-emerald-400',
      ].join(' ')}
      onClick={() => {
        if (!isPending) {
          onToggle(habitId, !isCompleted)
        }
      }}
    >
      {isCompleted && (
        <svg
          className="h-5 w-5 text-white"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  )
}
