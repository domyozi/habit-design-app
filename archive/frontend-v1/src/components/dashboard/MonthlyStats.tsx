/**
 * 月次統計コンポーネント
 * TASK-0021: 習慣トラッキング可視化
 *
 * 表示内容:
 * - 今週の達成率と達成数/総習慣数
 * - 今月の達成率と達成数/総習慣数
 *
 * 🔵 信頼性レベル: REQ-505 より
 */

interface MonthlyStatsProps {
  weeklyRate: number
  monthlyRate: number
  weeklyCompleted: number
  weeklyTotal: number
  monthlyCompleted: number
  monthlyTotal: number
}

export const MonthlyStats = ({
  weeklyRate,
  monthlyRate,
  weeklyCompleted,
  weeklyTotal,
  monthlyCompleted,
  monthlyTotal,
}: MonthlyStatsProps) => {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
        統計サマリー
      </h2>

      <div className="grid grid-cols-2 gap-4">
        {/* 今週 */}
        <div data-testid="weekly-section" className="rounded-xl bg-slate-50 p-3">
          <p className="mb-1 text-xs font-medium text-slate-400">今週</p>
          <p
            data-testid="weekly-rate"
            className="text-2xl font-bold text-slate-900"
          >
            {weeklyRate}%
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {weeklyCompleted} / {weeklyTotal} 件達成
          </p>
          {/* 進捗バー */}
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-sky-500 transition-all"
              style={{ width: `${Math.min(weeklyRate, 100)}%` }}
            />
          </div>
        </div>

        {/* 今月 */}
        <div data-testid="monthly-section" className="rounded-xl bg-slate-50 p-3">
          <p className="mb-1 text-xs font-medium text-slate-400">今月</p>
          <p
            data-testid="monthly-rate"
            className="text-2xl font-bold text-slate-900"
          >
            {monthlyRate}%
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {monthlyCompleted} / {monthlyTotal} 件達成
          </p>
          {/* 進捗バー */}
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${Math.min(monthlyRate, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
