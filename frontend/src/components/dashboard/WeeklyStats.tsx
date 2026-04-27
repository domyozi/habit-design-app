/**
 * 週間統計コンポーネント
 * TASK-0014: ダッシュボード画面実装
 *
 * 表示内容:
 * - 今週の達成率（%）
 * - 達成数 / 総習慣数
 * - 習慣ごとの進捗バー
 *
 * 🔵 信頼性レベル: REQ-504/505 より
 */

interface HabitStat {
  habit_id: string
  habit_title: string
  achievement_rate: number
  current_streak: number
}

interface WeeklyStatsData {
  week_start: string
  total_habits: number
  completed_count: number
  achievement_rate: number
  habit_stats: HabitStat[]
}

interface WeeklyStatsProps {
  stats: WeeklyStatsData
}

export const WeeklyStats = ({ stats }: WeeklyStatsProps) => {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
        今日の達成状況
      </h2>

      {/* 達成率（REQ-504） */}
      <div className="mb-4 flex items-end gap-2">
        <span className="text-4xl font-bold text-slate-900">
          {stats.achievement_rate}%
        </span>
        <span className="mb-1 text-sm text-slate-400">
          {stats.completed_count} / {stats.total_habits} 件
        </span>
      </div>

      {/* 全体進捗バー */}
      <div className="mb-5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-sky-500 transition-all"
          style={{ width: `${Math.min(stats.achievement_rate, 100)}%` }}
        />
      </div>

      {/* 習慣ごとの達成率（REQ-505） */}
      {stats.habit_stats.length > 0 && (
        <div className="space-y-3">
          {stats.habit_stats.map((habitStat) => {
            const widthClass = Math.round(habitStat.achievement_rate / 100 * 12)
            return (
              <div key={habitStat.habit_id}>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                  <span className="max-w-[70%] truncate">{habitStat.habit_title}</span>
                  <span className="font-medium">{habitStat.achievement_rate}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all"
                    style={{ width: `${Math.min(habitStat.achievement_rate, 100)}%` }}
                    aria-hidden="true"
                  />
                  {/* Tailwind静的クラス用（w-{n}/12形式の補完） */}
                  <span className={`hidden w-${widthClass}/12`} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
