/**
 * AI提案承認コンポーネント
 * TASK-0020: 週次レビュー画面実装
 * Design: AIDesigner dark premium — run 1137b5ae (weekly-review)
 *
 * 機能:
 * - 提案カード: 種別（時間変更/追加/削除）・提案内容・理由テキスト
 * - 「承認」→ PATCH /habits/{id} で action を適用
 * - 「却下」→ 提案カードを非表示
 * - 承認可能アクション: change_time / add_habit / remove_habit（REQ-303）
 *
 * 🔵 信頼性レベル: REQ-303・user-stories 4.1 より
 */
import { useState } from 'react'
import { apiPatch, apiPost, apiDelete } from '@/lib/api'
import { Spinner } from '@/components/ui/Spinner'

export type ActionType = 'change_time' | 'add_habit' | 'remove_habit'

export interface AIAction {
  id: string
  action_type?: ActionType
  type?: ActionType
  habit_id?: string
  habit_title?: string
  reason?: string
  proposed_value?: string
  suggested_time?: string
  params?: Record<string, unknown>
}

interface AIActionProposalProps {
  action: AIAction
  onApproved?: () => void
  onRejected?: () => void
}

const ACTION_META: Record<ActionType, { label: string; color: string; bgColor: string; borderColor: string; approveLabel: string }> = {
  change_time: {
    label: '時間変更',
    color: 'text-indigo-300',
    bgColor: 'bg-indigo-500/10',
    borderColor: 'border-indigo-500/20',
    approveLabel: '承認',
  },
  add_habit: {
    label: '新規追加',
    color: 'text-emerald-300',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    approveLabel: '承認して追加',
  },
  remove_habit: {
    label: '削除',
    color: 'text-rose-300',
    bgColor: 'bg-rose-500/10',
    borderColor: 'border-rose-500/20',
    approveLabel: '承認',
  },
}

export const AIActionProposal = ({ action, onApproved, onRejected }: AIActionProposalProps) => {
  const [isPending, setIsPending] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const actionType = action.action_type ?? action.type ?? 'change_time'
  const meta = ACTION_META[actionType]
  const proposedValue =
    action.proposed_value ??
    action.suggested_time ??
    (typeof action.params?.scheduled_time === 'string'
      ? action.params.scheduled_time
      : typeof action.params?.time === 'string'
        ? action.params.time
        : undefined)
  const habitTitle =
    action.habit_title ??
    (typeof action.params?.title === 'string' ? action.params.title : '新しい習慣')
  const reason =
    action.reason ??
    (actionType === 'change_time'
      ? '今週の実績をもとに、より続けやすい時間帯への調整が提案されました。'
      : actionType === 'add_habit'
        ? '今週の振り返りから、目標達成に必要な追加習慣が提案されました。'
        : '負荷を下げて継続率を上げるため、見直し候補として提案されました。')

  if (isDismissed) return null

  const handleApprove = async () => {
    setIsPending(true)
    try {
      if (actionType === 'change_time' && action.habit_id) {
        await apiPatch(`/api/habits/${action.habit_id}`, { action: 'change_time', scheduled_time: proposedValue })
      } else if (actionType === 'add_habit') {
        await apiPost('/api/habits', { title: habitTitle, frequency: 'daily' })
      } else if (actionType === 'remove_habit' && action.habit_id) {
        await apiDelete(`/api/habits/${action.habit_id}`)
      }
      setIsDismissed(true)
      onApproved?.()
    } catch {
      // エラーは無視して却下状態へ
      setIsDismissed(true)
    } finally {
      setIsPending(false)
    }
  }

  const handleReject = () => {
    setIsDismissed(true)
    onRejected?.()
  }

  const isRemove = actionType === 'remove_habit'

  return (
    <div
      className="flex w-[85%] shrink-0 snap-center flex-col rounded-3xl p-5"
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* 種別バッジ */}
      <div className={`mb-4 self-start rounded-full px-2.5 py-1 text-[10px] font-bold ${meta.bgColor} ${meta.color} border ${meta.borderColor}`}>
        {meta.label}
      </div>

      {/* タイトル */}
      <h4 className={`mb-2 text-lg font-bold ${isRemove ? 'text-slate-300 line-through decoration-slate-600' : 'text-white'}`}>
        {habitTitle}
      </h4>

      {/* 理由 */}
      <p className="mb-6 flex-1 text-xs leading-relaxed text-slate-400">{reason}</p>

      {/* アクション */}
      <div className="mt-auto grid grid-cols-2 gap-3 pt-2">
        <button
          type="button"
          onClick={handleReject}
          disabled={isPending}
          className="rounded-xl py-2.5 text-xs font-bold text-slate-300 transition-colors hover:text-white disabled:opacity-50"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          {isRemove ? '維持する' : '却下'}
        </button>
        <button
          type="button"
          onClick={handleApprove}
          disabled={isPending}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-white transition-colors disabled:opacity-50 ${meta.bgColor} border ${meta.borderColor} ${meta.color}`}
          style={actionType === 'add_habit' ? { background: 'linear-gradient(135deg,#10b981,#059669)', boxShadow: '0 4px 20px -2px rgba(16,185,129,0.4)' } : {}}
        >
          {isPending ? <Spinner size="sm" tone="light" /> : meta.approveLabel}
        </button>
      </div>
    </div>
  )
}
