/**
 * 3行日報フォームコンポーネント
 * TASK-0016: 未達成理由入力・3行日報フォーム実装
 *
 * 3つの入力:
 * 1. 習慣達成状況（チェックリストから自動集計、表示のみ）
 * 2. 今日やったこと（1行テキスト）
 * 3. 明日のラスボス（1行テキスト）
 *
 * 送信: POST /api/journal-entries (entry_type: 'daily_report')
 *
 * 🔵 信頼性レベル: REQ-405 より
 */
import { useForm } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { apiPost } from '@/lib/api'
import { Spinner } from '@/components/ui/Spinner'

interface DailyReportFormProps {
  achievementSummary: string
  onClose?: () => void
  onSubmitted?: () => void
}

interface FormValues {
  what_i_did: string
  boss_tomorrow: string
}

export const DailyReportForm = ({
  achievementSummary,
  onClose,
  onSubmitted,
}: DailyReportFormProps) => {
  const { register, handleSubmit } = useForm<FormValues>()
  const today = new Date().toISOString().split('T')[0]

  const { mutate, isPending, isError, isSuccess } = useMutation({
    mutationFn: (data: FormValues) =>
      apiPost('/api/journal-entries', {
        entry_date: today,
        entry_type: 'daily_report',
        content: JSON.stringify({
          achievement_summary: achievementSummary,
          what_i_did: data.what_i_did,
          boss_tomorrow: data.boss_tomorrow,
        }),
      }),
    onSuccess: () => {
      onSubmitted?.()
    },
  })

  const onSubmit = (data: FormValues) => {
    mutate(data)
  }

  if (isSuccess) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
        <p className="text-sm font-medium text-emerald-700">日報を保存しました！</p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h3 className="mb-4 text-sm font-semibold text-slate-800">今日の3行日報</h3>

      {/* 習慣達成状況（表示のみ） */}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-slate-600">習慣達成状況</label>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
          {achievementSummary}
        </div>
      </div>

      {/* 今日やったこと */}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-slate-600">今日やったこと</label>
        <input
          {...register('what_i_did')}
          type="text"
          placeholder="今日の主な行動を1行で"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
        />
      </div>

      {/* 明日のラスボス */}
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-slate-600">明日のラスボス</label>
        <input
          {...register('boss_tomorrow')}
          type="text"
          placeholder="明日最も重要なタスクは？"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
        />
      </div>

      {isError && (
        <p role="alert" className="mb-3 text-xs text-rose-600">
          保存に失敗しました。もう一度お試しください。
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg px-4 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            キャンセル
          </button>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
        >
          {isPending ? (
            <>
              <Spinner size="sm" tone="light" />
              <span>保存中...</span>
            </>
          ) : (
            <span>保存</span>
          )}
        </button>
      </div>
    </form>
  )
}
