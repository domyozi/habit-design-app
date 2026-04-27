/**
 * スケルトンローダーコンポーネント
 * TASK-0014: ダッシュボード画面実装
 *
 * 🟡 信頼性レベル: UX向上のための推測による実装
 */

interface SkeletonProps {
  className?: string
}

export const Skeleton = ({ className = '' }: SkeletonProps) => (
  <div className={`animate-pulse rounded bg-slate-200 ${className}`} />
)

export const SkeletonHabitCard = () => (
  <div className="animate-pulse rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-4">
      <div className="h-11 w-11 rounded-xl bg-slate-200" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  </div>
)

export const SkeletonWeeklyStats = () => (
  <div className="animate-pulse rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
    <Skeleton className="mb-4 h-5 w-32" />
    <Skeleton className="mb-3 h-8 w-20" />
    <div className="space-y-2">
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-3/5" />
    </div>
  </div>
)
