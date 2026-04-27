/**
 * ダッシュボード画面
 * TASK-0014: ダッシュボード画面実装
 * Design: AIDesigner dark premium — run 67c00a50 (dashboard)
 *
 * 表示内容:
 * - ∞ブランドヘッダー
 * - 今日の達成進捗アーク
 * - 習慣リスト（HabitList）
 * - グローバルナビゲーション（フローティングガラス）
 *
 * 🔵 信頼性レベル: REQ-205/306/502/504/505 より
 */
import { useState, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { apiGet, apiPost } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useHabitLog } from '@/hooks/useHabitLog'
import { useVoiceInput } from '@/hooks/useVoiceInput'
import { HabitList } from '@/components/habits/HabitList'
import { VoiceInputButton } from '@/components/dashboard/VoiceInputButton'
import { VoiceInputModal } from '@/components/dashboard/VoiceInputModal'
import { BadgeEarnedModal } from '@/components/habits/BadgeEarnedModal'
import { SkeletonHabitCard } from '@/components/ui/Skeleton'
import type { ApiResponse, VoiceInputResponse } from '@/types/interfaces'

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

interface WeeklyStatsData {
  week_start: string
  total_habits: number
  completed_count: number
  achievement_rate: number
  habit_stats: Array<{
    habit_id: string
    habit_title: string
    achievement_rate: number
    current_streak: number
  }>
}

interface DashboardQueryData {
  habits: HabitWithTodayStatus[]
  weeklyStats: WeeklyStatsData
}

type VoiceResultType = 'checklist' | 'journaling' | 'daily_report' | 'unknown'

interface VoiceResult {
  type: VoiceResultType
  message?: string
}

/** エラー詳細の抽出 */
const extractErrorDetails = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    return {
      status: error.response?.status,
      requestUrl: error.config?.url ?? '/api/habits?include_today_log=true',
      message: error.message,
      responseBody: error.response?.data
        ? typeof error.response.data === 'string'
          ? error.response.data
          : JSON.stringify(error.response.data, null, 2)
        : null,
    }
  }
  if (error instanceof Error) {
    return { status: null, requestUrl: '/api/habits?include_today_log=true', message: error.message, responseBody: null }
  }
  return { status: null, requestUrl: '/api/habits?include_today_log=true', message: 'Unknown error', responseBody: null }
}

const ErrorState = ({ error, onRetry }: { error: unknown; onRetry: () => void }) => {
  const { status, requestUrl, message, responseBody } = extractErrorDetails(error)
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="max-w-xl rounded-3xl border border-rose-500/20 bg-rose-500/5 p-5 text-left backdrop-blur-xl">
        <p className="text-sm font-semibold text-slate-100">データを読み込めませんでした</p>
        <dl className="mt-4 space-y-2 text-xs text-slate-400">
          <div><dt className="font-medium text-slate-300">URL</dt><dd className="font-mono">{requestUrl}</dd></div>
          <div><dt className="font-medium text-slate-300">ステータス</dt><dd>{status ?? '取得不可'}</dd></div>
          <div><dt className="font-medium text-slate-300">メッセージ</dt><dd>{message}</dd></div>
        </dl>
        {responseBody && (
          <pre className="mt-3 overflow-x-auto rounded-xl bg-black/40 px-3 py-2 text-xs text-slate-300">{responseBody}</pre>
        )}
      </div>
      <button
        type="button"
        className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
        onClick={onRetry}
      >
        再試行する
      </button>
    </div>
  )
}

/** 今日の進捗アーク */
const ProgressArc = ({
  completed,
  total,
  achievementRate,
}: {
  completed: number
  total: number
  achievementRate: number
}) => {
  const r = 42
  const circumference = 2 * Math.PI * r
  const pct = achievementRate / 100
  const dashOffset = circumference * (1 - pct)
  return (
    <section
      className="relative mb-8 overflow-hidden rounded-[28px] p-5"
      style={{
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <span className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">Today</span>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            {achievementRate}%
          </h2>
          <p className="text-sm font-medium text-slate-400">{completed}/{total} 件達成</p>
        </div>
        <div className="relative flex h-20 w-20 items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-emerald-400/5 blur-md" />
          <svg className="h-full w-full drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]" viewBox="0 0 100 100">
            <circle className="fill-transparent stroke-white/[0.06]" strokeWidth="8" cx="50" cy="50" r={r} />
            <circle
              className="fill-transparent stroke-emerald-400"
              strokeWidth="8"
              strokeLinecap="round"
              cx="50" cy="50" r={r}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 1.2s cubic-bezier(.65,0,.35,1)' }}
            />
          </svg>
          <svg className="absolute h-6 w-6 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </div>
    </section>
  )
}

/** スケルトン */
const LoadingSkeleton = () => (
  <div className="space-y-4">
    <div className="h-28 animate-pulse rounded-[28px] bg-white/[0.04]" />
    <SkeletonHabitCard />
    <SkeletonHabitCard />
    <SkeletonHabitCard />
  </div>
)

const Dashboard = () => {
  const { signOut } = useAuthStore()
  const { mutate: logHabit } = useHabitLog()
  const { transcript, isListening, isSupported, startListening, stopListening } = useVoiceInput()
  const [earnedBadge, setEarnedBadge] = useState<{ name: string } | null>(null)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false)
  const [isAnalyzingVoice, setIsAnalyzingVoice] = useState(false)
  const [voiceResult, setVoiceResult] = useState<VoiceResult | null>(null)

  const { data, isPending, isError, error, refetch } = useQuery<DashboardQueryData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const habitsRes = await apiGet<ApiResponse<HabitWithTodayStatus[]>>(
        '/api/habits?include_today_log=true'
      )
      const habits = Array.isArray(habitsRes)
        ? (habitsRes as HabitWithTodayStatus[])
        : ((habitsRes as ApiResponse<HabitWithTodayStatus[]>).data ?? [])

      const completedCount = habits.filter(
        h => h.today_completed || h.today_log?.completed === true
      ).length
      const achievementRate =
        habits.length > 0 ? Math.round((completedCount / habits.length) * 100) : 0

      const weeklyStats: WeeklyStatsData = {
        week_start: new Date().toISOString().slice(0, 10),
        total_habits: habits.length,
        completed_count: completedCount,
        achievement_rate: achievementRate,
        habit_stats: habits.map(h => ({
          habit_id: h.id,
          habit_title: h.title,
          achievement_rate: h.today_completed || h.today_log?.completed === true ? 100 : 0,
          current_streak: h.current_streak,
        })),
      }
      return { habits, weeklyStats }
    },
  })

  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    if (!transcript) return
    setVoiceTranscript(transcript)
    setVoiceResult(null)
    setIsVoiceModalOpen(true)
  }, [transcript])

  const handleToggle = useCallback(
    (habitId: string, completed: boolean) => {
      logHabit(
        { habitId, completed, date: today },
        {
          onSuccess: (result) => {
            const badge = (result as { data?: { badge_earned?: { badge: { name: string } } } })?.data?.badge_earned
            if (badge) setEarnedBadge({ name: badge.badge.name })
          },
        }
      )
    },
    [logHabit, today]
  )

  const handleVoiceTranscript = useCallback((text: string) => {
    setVoiceTranscript(text)
    setVoiceResult(null)
    setIsVoiceModalOpen(true)
  }, [])

  const handleVoiceSubmit = useCallback(async () => {
    if (!voiceTranscript.trim()) return

    setIsAnalyzingVoice(true)
    setVoiceResult(null)

    try {
      const response = await apiPost<ApiResponse<VoiceInputResponse> | VoiceInputResponse>(
        '/api/voice-input',
        { text: voiceTranscript.trim(), date: today }
      )

      const payload =
        'data' in (response as ApiResponse<VoiceInputResponse>)
          ? (response as ApiResponse<VoiceInputResponse>).data
          : (response as VoiceInputResponse)

      if (!payload) {
        setVoiceResult({ type: 'unknown' })
        return
      }

      if (payload.type === 'checklist') {
        setVoiceResult({
          type: 'checklist',
          message: `習慣を更新しました${payload.updated_habits?.length ? `（${payload.updated_habits.length}件）` : ''}`,
        })
        void refetch()
        return
      }

      if (payload.type === 'journaling' || payload.type === 'daily_report') {
        setVoiceResult({ type: payload.type })
        return
      }

      setVoiceResult({ type: 'unknown' })
    } catch {
      setVoiceResult({
        type: 'unknown',
        message: '音声入力の解析に失敗しました。しばらくしてから再試行してください。',
      })
    } finally {
      setIsAnalyzingVoice(false)
    }
  }, [refetch, today, voiceTranscript])

  const handleCloseVoiceModal = useCallback(() => {
    if (isListening) stopListening()
    setIsVoiceModalOpen(false)
    setIsAnalyzingVoice(false)
    setVoiceResult(null)
    setVoiceTranscript('')
  }, [isListening, stopListening])

  const handleSelectVoiceAction = useCallback((action: VoiceResultType) => {
    setVoiceResult({
      type: action,
      message:
        action === 'checklist'
          ? 'どの操作かを確認しました。内容を少し言い換えて再送してください。'
          : action === 'journaling'
            ? 'ジャーナルとして扱う候補です。内容を確認して再送してください。'
            : '日報として扱う候補です。内容を確認して再送してください。',
    })
  }, [])

  const completedCount = data?.weeklyStats.completed_count ?? 0
  const totalHabits = data?.weeklyStats.total_habits ?? 0
  const remainingCount = Math.max(totalHabits - completedCount, 0)

  return (
    <div className="relative overflow-hidden">
      {/* Aurora glows */}
      <div className="pointer-events-none absolute left-[-20%] top-[-10%] h-[350px] w-[350px] rounded-full bg-emerald-500/10 blur-[70px]" aria-hidden />
      <div className="pointer-events-none absolute bottom-[20%] right-[-20%] h-[300px] w-[300px] rounded-full bg-sky-500/10 blur-[70px]" aria-hidden />
      <div className="pointer-events-none absolute left-[20%] top-[40%] h-[200px] w-[200px] rounded-full bg-indigo-500/5 blur-[80px]" aria-hidden />

      {/* ヘッダー */}
      <header
        className="sticky top-0 z-40 px-4 py-3"
        style={{
          background: 'rgba(2,6,23,0.65)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-2">
            {/* ∞ ロゴマーク */}
            <div
              className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.10)' }}
            >
              <svg className="h-5 w-5 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 12c-2-2.5-4-4-6-4a4 4 0 0 0 0 8c2 0 4-1.5 6-4z" />
                <path d="M12 12c2 2.5 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.5-6 4z" />
              </svg>
            </div>
            <span className="text-sm font-bold uppercase tracking-widest text-white">Habit Design</span>
          </div>
          {/* ログアウトは Settings ページに一本化 */}
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="mx-auto w-full max-w-2xl px-4 pb-12 pt-6">
        {isPending && <LoadingSkeleton />}
        {isError && <ErrorState error={error} onRetry={() => refetch()} />}
        {data && (
          <div className="space-y-6">
            <section
              className="overflow-hidden rounded-[28px] border border-white/10 p-5"
              style={{
                background: 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)',
                backdropFilter: 'blur(18px)',
                WebkitBackdropFilter: 'blur(18px)',
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                    Daily Focus
                  </p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                    今日の習慣を片付ける
                  </h1>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-300">
                    先に着手すべき数と達成済みを分けて見せています。迷ったら、下の一覧から次の1件を完了してください。
                  </p>
                </div>
                <div className="grid min-w-[210px] grid-cols-2 gap-3 self-stretch">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">残り</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{remainingCount}</p>
                    <p className="mt-1 text-xs text-slate-400">まだ着手していない習慣</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.08] p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300/80">完了</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{completedCount}</p>
                    <p className="mt-1 text-xs text-slate-300">今日すでに終えた件数</p>
                  </div>
                </div>
              </div>
            </section>

            <ProgressArc
              completed={data.weeklyStats.completed_count}
              total={data.weeklyStats.total_habits}
              achievementRate={data.weeklyStats.achievement_rate}
            />
            <section>
              <div className="mb-4 flex items-center gap-4">
                <div>
                  <h2 className="text-sm font-semibold tracking-wide text-white">今日の習慣</h2>
                  <p className="mt-1 text-xs text-slate-400">予定時刻と連続記録を見ながら、その場で完了を付けられます。</p>
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                <VoiceInputButton
                  isSupported={isSupported}
                  isListening={isListening}
                  onStartListening={() => {
                    setVoiceTranscript('')
                    setVoiceResult(null)
                    setIsVoiceModalOpen(true)
                    startListening()
                  }}
                  onStopListening={stopListening}
                  onTranscript={handleVoiceTranscript}
                />
              </div>
              <HabitList habits={data.habits} onToggle={handleToggle} />
            </section>
          </div>
        )}
      </main>

      {/* バッジ獲得通知（REQ-901） */}
      {earnedBadge && (
        <BadgeEarnedModal badgeName={earnedBadge.name} onClose={() => setEarnedBadge(null)} />
      )}

      {isVoiceModalOpen && (
        <VoiceInputModal
          transcript={voiceTranscript}
          isAnalyzing={isAnalyzingVoice || isListening}
          result={voiceResult}
          onClose={handleCloseVoiceModal}
          onSubmit={handleVoiceSubmit}
          onResend={() => setVoiceResult(null)}
          onSelectAction={handleSelectVoiceAction}
        />
      )}
    </div>
  )
}

export default Dashboard
