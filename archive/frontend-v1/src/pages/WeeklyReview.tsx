/**
 * 週次レビュー画面
 * TASK-0020: 週次レビュー画面実装（AIフィードバックSSE表示・AI提案承認UI）
 * Design: AIDesigner dark premium — run 1137b5ae (weekly-review)
 *
 * 機能:
 * - 週間達成率アーク + ストリーク統計
 * - 「週次レビューを開始する」でSSE接続（REQ-703）
 * - AIフィードバックをリアルタイム表示（REQ-603）
 * - AI提案アクションの承認/却下（REQ-303）
 * - 過去レビュー履歴タイムライン（REQ-601）
 * - AI障害時エラー表示（EDGE-001）
 *
 * 🔵 信頼性レベル: REQ-601/602/603/702/703・user-stories 4.1/5.1 より
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { apiGet } from '@/lib/api'
import { useSSEStream } from '@/hooks/useSSEStream'
import { WeeklyReviewFeedback } from '@/components/ai/WeeklyReviewFeedback'
import type { ApiResponse } from '@/types/interfaces'
import type { AIAction } from '@/components/ai/AIActionProposal'

interface WeeklyStats {
  achievement_rate: number
  completed_count: number
  total_habits: number
  current_streak: number
}

interface ReviewHistory {
  id: string
  week_start: string
  week_end: string
  achievement_rate: number
  summary?: string
}

const mapActionToProposal = (action: Record<string, unknown>, index: number): AIAction | null => {
  const actionType = action.action_type
  if (
    actionType !== 'change_time' &&
    actionType !== 'add_habit' &&
    actionType !== 'remove_habit'
  ) {
    return null
  }

  const params =
    typeof action.params === 'object' && action.params !== null
      ? (action.params as Record<string, unknown>)
      : undefined

  return {
    id: `${actionType}-${typeof action.habit_id === 'string' ? action.habit_id : index}`,
    action_type: actionType,
    habit_id: typeof action.habit_id === 'string' ? action.habit_id : undefined,
    habit_title: typeof params?.title === 'string' ? params.title : undefined,
    proposed_value:
      typeof params?.scheduled_time === 'string'
        ? params.scheduled_time
        : typeof params?.time === 'string'
          ? params.time
          : undefined,
    params,
  }
}

/** 進捗アーク */
const AchievementArc = ({ stats }: { stats: WeeklyStats }) => {
  const pct = stats.achievement_rate / 100
  const dash = pct * 100
  return (
    <section
      className="relative mb-8 overflow-hidden rounded-3xl p-5"
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className="absolute left-5 right-5 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
      <div className="flex items-center gap-6">
        {/* SVGアーク */}
        <div className="relative h-28 w-28 shrink-0">
          <svg viewBox="0 0 36 36" className="h-full w-full">
            <path
              className="fill-none stroke-white/[0.05]"
              strokeWidth="3.8"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="fill-none stroke-emerald-400"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${dash}, 100`}
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              style={{ filter: 'drop-shadow(0 0 6px rgba(16,185,129,0.5))' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-white">
              {stats.achievement_rate}<span className="text-xs text-slate-500">%</span>
            </span>
            <span className="text-[9px] font-medium tracking-wide text-emerald-400/80">
              {stats.achievement_rate >= 80 ? 'Excellent' : stats.achievement_rate >= 60 ? 'Good' : 'Keep going'}
            </span>
          </div>
        </div>

        {/* スタッツチップ */}
        <div className="flex w-full flex-col gap-3">
          <div className="flex items-center justify-between rounded-2xl border border-white/[0.05] bg-white/[0.04] p-3">
            <div className="flex items-center gap-2 text-rose-300">
              <span className="text-lg drop-shadow-[0_0_8px_rgba(251,113,133,0.5)]">🔥</span>
              <span className="text-xs font-medium text-slate-300">継続ストリーク</span>
            </div>
            <span className="text-sm font-bold text-white">
              {stats.current_streak}<span className="ml-1 text-[10px] text-slate-500">日</span>
            </span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-white/[0.05] bg-white/[0.04] p-3">
            <div className="flex items-center gap-2 text-emerald-300">
              <svg className="h-5 w-5 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" fill="currentColor" viewBox="0 0 24 24"><path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-xs font-medium text-slate-300">完了タスク</span>
            </div>
            <span className="text-sm font-bold text-white">
              {stats.completed_count}<span className="mx-1 text-[10px] text-slate-500">/</span>{stats.total_habits}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

/** 履歴タイムライン */
const ReviewTimeline = ({ history }: { history: ReviewHistory[] }) => {
  if (history.length === 0) return null
  return (
    <section>
      <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-500">履歴</h3>
      <div className="relative pl-6 space-y-6">
        <div className="absolute left-2.5 top-2 bottom-4 w-px bg-gradient-to-b from-white/10 via-white/5 to-transparent" />
        {history.map((item, i) => (
          <div key={item.id} className="relative">
            <div className={`absolute -left-[23px] top-1 ring-4 ring-[#020617] rounded-full ${i === 0 ? 'h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'h-2 w-2 bg-slate-600'}`} />
            <div className="flex items-end justify-between mb-1">
              <span className={`text-xs font-${i === 0 ? 'bold text-slate-300' : 'medium text-slate-400'}`}>
                {item.week_start} - {item.week_end}
              </span>
              <span className={`text-xs font-medium ${i === 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                {item.achievement_rate}%
              </span>
            </div>
            {item.summary && (
              <div className="inline-block rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1 text-[11px] text-slate-500">
                {item.summary}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

const WeeklyReview = () => {
  const navigate = useNavigate()
  const [reviewStarted, setReviewStarted] = useState(false)

  const { data: statsData } = useQuery<WeeklyStats>({
    queryKey: ['weekly-stats'],
    queryFn: async () => {
      try {
        const res = await apiGet<ApiResponse<WeeklyStats>>('/api/stats/weekly')
        return (res as ApiResponse<WeeklyStats>).data ?? {
          achievement_rate: 0, completed_count: 0, total_habits: 0, current_streak: 0,
        }
      } catch {
        // フォールバック: 習慣リストから導出
        type HabitItem = { today_completed: boolean; today_log: { completed: boolean } | null; current_streak: number }
        const habitsRes = await apiGet<ApiResponse<HabitItem[]>>('/api/habits?include_today_log=true')
        const rawData = (habitsRes as ApiResponse<HabitItem[]>).data
        const habitList: HabitItem[] = Array.isArray(rawData) ? rawData : Array.isArray(habitsRes) ? (habitsRes as unknown as HabitItem[]) : []
        const completed = habitList.filter(h => h.today_completed || h.today_log?.completed).length
        const maxStreak = habitList.reduce((m, h) => Math.max(m, h.current_streak), 0)
        return {
          achievement_rate: habitList.length > 0 ? Math.round((completed / habitList.length) * 100) : 0,
          completed_count: completed,
          total_habits: habitList.length,
          current_streak: maxStreak,
        }
      }
    },
  })

  const { data: historyData } = useQuery<ReviewHistory[]>({
    queryKey: ['review-history'],
    queryFn: async () => {
      try {
        const res = await apiGet<ApiResponse<ReviewHistory[]>>('/api/weekly-reviews')
        const data = (res as ApiResponse<ReviewHistory[]>).data
        return Array.isArray(data) ? data : []
      } catch { return [] }
    },
  })

  // SSE接続（GET /ai/weekly-review/stream）
  const { chunks, isDone, actions: rawActions, error } = useSSEStream(
    '/api/ai/weekly-review/stream',
    reviewStarted
  )

  const actions: AIAction[] = rawActions
    .map((action, index) => mapActionToProposal(action as unknown as Record<string, unknown>, index))
    .filter((action): action is AIAction => action !== null)

  const defaultStats: WeeklyStats = { achievement_rate: 0, completed_count: 0, total_habits: 0, current_streak: 0 }

  return (
    <div className="relative overflow-x-hidden">
      {/* Aurora glows */}
      <div className="pointer-events-none absolute left-[-20%] top-[-10%] h-[300px] w-[300px] rounded-full bg-emerald-500/[0.08] blur-[40px]" aria-hidden />
      <div className="pointer-events-none absolute right-[-10%] top-[40%] h-[250px] w-[250px] rounded-full bg-violet-500/[0.06] blur-[40px]" aria-hidden />

      {/* ヘッダー */}
      <header
        className="sticky top-0 z-50 px-4 py-4"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-300 transition-colors hover:text-white"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            aria-label="戻る"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.5)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 12c-2-2.5-4-4-6-4a4 4 0 0 0 0 8c2 0 4-1.5 6-4z" />
              <path d="M12 12c2 2.5 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.5-6 4z" />
            </svg>
            <h1 className="text-sm font-bold tracking-wider text-slate-100">週次レビュー</h1>
          </div>
          <div className="h-10 w-10" />
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="relative z-10 mx-auto w-full max-w-2xl space-y-8 px-5 pb-12 pt-6">
        {!reviewStarted && (
          <section
            className="rounded-[28px] border border-white/10 p-5"
            style={{
              background: 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
            }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">
              Weekly Reflection
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              今週の成果を振り返って、次週の打ち手を決める
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              数字の確認だけで終わらせず、詰まりやすい時間帯や次に変えるべき習慣までAIが整理します。
            </p>
          </section>
        )}

        {/* 達成率アーク */}
        <AchievementArc stats={statsData ?? defaultStats} />

        {/* レビュー説明カード（未開始時のみ） */}
        {!reviewStarted && (
          <section
            className="rounded-3xl p-5"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">今週のレビューでできること</p>
            <p className="mb-4 text-sm leading-relaxed text-slate-300">
              振り返りの目的を先に明確にすると、開始ボタンの意味が伝わりやすくなります。
            </p>
            <div className="space-y-3">
              {[
                { icon: '🧠', title: 'AI が今週を分析', desc: '達成パターンや詰まりポイントを自動で整理' },
                { icon: '💡', title: '改善提案を生成', desc: '時間帯の変更・習慣の追加など具体的なアクションを提案' },
                { icon: '🎯', title: '次週の目標を設定', desc: '提案を承認するだけで来週の習慣が最適化される' },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3">
                  <span className="mt-0.5 text-lg leading-none">{icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{title}</p>
                    <p className="text-xs text-slate-300">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* レビュー開始ボタン（REQ-703） */}
        {!reviewStarted && (
          <button
            type="button"
            onClick={() => setReviewStarted(true)}
            className="group w-full rounded-2xl py-4 text-sm font-bold tracking-wide text-white transition-all active:scale-[0.97]"
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              boxShadow: '0 4px 20px -2px rgba(16,185,129,0.4)',
            }}
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
              週次レビューを開始する
            </span>
          </button>
        )}

        {/* AIフィードバック */}
        {reviewStarted && (
          <WeeklyReviewFeedback
            chunks={chunks}
            isDone={isDone}
            isStreaming={!isDone && !error && reviewStarted}
            actions={actions}
            error={error}
            onActionApproved={() => void apiGet('/api/habits?include_today_log=true')}
          />
        )}

        {/* 過去のレビュー履歴（REQ-601） */}
        <ReviewTimeline history={historyData ?? []} />
      </main>
    </div>
  )
}

export default WeeklyReview
