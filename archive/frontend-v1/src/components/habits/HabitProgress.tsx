/**
 * 習慣達成率進捗バーコンポーネント
 * TASK-0021: 習慣トラッキング可視化
 *
 * 表示内容:
 * - 習慣名と達成率（%）
 * - 達成率に応じたカラー進捗バー
 *   - 80%以上: 緑（bg-green-500）
 *   - 50〜79%: 黄（bg-yellow-500）
 *   - 50%未満: 赤（bg-red-500）
 * - ストリーク日数（炎アイコン付き）
 *
 * 🔵 信頼性レベル: REQ-504/502 より
 */

interface HabitProgressProps {
  habitId: string
  habitTitle: string
  achievementRate: number
  currentStreak: number
}

const getBarColor = (rate: number): string => {
  if (rate >= 80) return 'bg-green-500'
  if (rate >= 50) return 'bg-yellow-500'
  return 'bg-red-500'
}

export const HabitProgress = ({
  habitId: _habitId,
  habitTitle,
  achievementRate,
  currentStreak,
}: HabitProgressProps) => {
  const barColor = getBarColor(achievementRate)
  const clampedRate = Math.min(Math.max(achievementRate, 0), 100)

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      {/* ヘッダー: 習慣名・達成率・ストリーク */}
      <div className="mb-2 flex items-center justify-between">
        <span className="max-w-[60%] truncate text-sm font-medium text-slate-700">
          {habitTitle}
        </span>
        <div className="flex items-center gap-2">
          {currentStreak > 0 && (
            <span
              data-testid="streak-display"
              className="flex items-center gap-0.5 text-xs font-medium text-orange-500"
            >
              🔥{currentStreak}日
            </span>
          )}
          <span className="text-sm font-bold text-slate-900">{achievementRate}%</span>
        </div>
      </div>

      {/* 進捗バー */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          data-testid="progress-bar"
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${clampedRate}%` }}
        />
      </div>
    </div>
  )
}
