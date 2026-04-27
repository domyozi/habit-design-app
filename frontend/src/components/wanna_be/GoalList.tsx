/**
 * 長期目標一覧コンポーネント
 * TASK-0018: 長期目標管理画面実装
 *
 * 機能:
 * - 承認済み長期目標を最大3件表示（REQ-203/204）
 * - 現在の件数 / 上限（3）を表示して残枠を視覚化
 * - 目標タイトル・説明・紐付く習慣数を表示
 *
 * 🔵 信頼性レベル: REQ-203/204 より
 */

const MAX_GOALS = 3

interface GoalItem {
  id: string
  title: string
  description?: string | null
  habit_count?: number
}

interface GoalListProps {
  goals: GoalItem[]
}

export const GoalList = ({ goals }: GoalListProps) => {
  const remaining = MAX_GOALS - goals.length

  return (
    <div className="space-y-3">
      {/* ヘッダー: 件数カウンター（REQ-204） */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">長期目標</h3>
          <p className="mt-1 text-xs text-slate-400">保存済みの目標。ここから日々の習慣設計へつながります。</p>
        </div>
        <span
          className={[
            'rounded-full px-2.5 py-0.5 text-xs font-medium',
            goals.length >= MAX_GOALS
              ? 'bg-amber-400/20 text-amber-400'
              : 'bg-white/[0.06] text-slate-400',
          ].join(' ')}
        >
          {goals.length} / {MAX_GOALS}
        </span>
      </div>

      {/* 空状態 */}
      {goals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.10] px-4 py-6 text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <p className="text-sm text-slate-400">目標がまだ設定されていません</p>
          <p className="mt-1 text-xs text-slate-600">
            「AIに相談する」から目標を提案してもらいましょう
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {goals.map((goal, index) => (
              <li key={goal.id}>
                <div
                  className="rounded-2xl px-4 py-3"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {/* 順序番号 */}
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-400">
                          {index + 1}
                        </span>
                        <p className="truncate text-sm font-semibold text-slate-100">
                          {goal.title}
                        </p>
                      </div>
                      {goal.description && (
                        <p className="mt-1 pl-7 text-xs leading-relaxed text-slate-300">
                          {goal.description}
                        </p>
                      )}
                    </div>
                    {/* 紐付く習慣数 */}
                    {goal.habit_count !== undefined && goal.habit_count > 0 && (
                      <span className="shrink-0 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-400">
                        {goal.habit_count}件の習慣
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* 残枠ガイド */}
          {remaining > 0 && (
            <p className="text-xs text-slate-400">
              あと {remaining} 件追加できます（最大 {MAX_GOALS} 件）
            </p>
          )}
        </>
      )}
    </div>
  )
}
