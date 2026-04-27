/**
 * 未達成理由入力コンポーネント
 * TASK-0016: 未達成理由入力・3行日報フォーム実装
 *
 * 機能:
 * - 習慣を❌にした後にインラインで表示
 * - React Hook Form でフォーム管理
 * - 「任意」ラベル付き（入力は強制しない）
 * - 送信: POST /api/habits/{id}/failure-reason
 * - 「スキップ」ボタンで入力欄を閉じる
 *
 * 🔵 信頼性レベル: REQ-406・user-stories 2.3 より
 */
import { useForm } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { apiPost } from '@/lib/api'
import { Spinner } from '@/components/ui/Spinner'

interface FailureReasonInputProps {
  habitId: string
  logDate: string
  onClose: () => void
  onSubmitted?: () => void
}

interface FormValues {
  reason: string
}

export const FailureReasonInput = ({
  habitId,
  logDate,
  onClose,
  onSubmitted,
}: FailureReasonInputProps) => {
  const { register, handleSubmit } = useForm<FormValues>()

  const { mutate, isPending, isError } = useMutation({
    mutationFn: (data: FormValues) =>
      apiPost(`/api/habits/${habitId}/failure-reason`, {
        log_date: logDate,
        reason: data.reason,
      }),
    onSuccess: () => {
      onSubmitted?.()
      onClose()
    },
  })

  const onSubmit = (data: FormValues) => {
    mutate(data)
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
    >
      <div className="mb-2 flex items-center gap-2">
        <label className="text-xs font-medium text-slate-700">未達成の理由</label>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-500">
          任意
        </span>
      </div>

      <textarea
        {...register('reason')}
        rows={2}
        placeholder="理由を入力してください（例: 残業で時間がなかった）"
        className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
      />

      {isError && (
        <p role="alert" className="mt-1 text-xs text-rose-600">
          送信に失敗しました。もう一度お試しください。
        </p>
      )}

      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="rounded-lg px-3 py-1.5 text-xs text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-50"
        >
          スキップ
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-600 disabled:opacity-60"
        >
          {isPending ? (
            <>
              <Spinner size="sm" tone="light" />
              <span>送信中...</span>
            </>
          ) : (
            <span>送信</span>
          )}
        </button>
      </div>
    </form>
  )
}
