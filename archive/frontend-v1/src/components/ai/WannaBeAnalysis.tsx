/**
 * Wanna Be AI分析ストリーミング表示コンポーネント
 * TASK-0017: Wanna Be設定・AI分析ストリーミング画面実装
 *
 * 機能:
 * - ストリーミングテキストをタイプライター風に逐次表示
 * - done 時に目標候補を選択 UI で表示
 * - 4件超の候補は「3件以内に絞ることをお勧めします」（REQ-204）
 * - 「保存する」ボタンで POST /api/goals
 * - AI_UNAVAILABLE 時はエラーメッセージ
 *
 * 🔵 信頼性レベル: REQ-203/204・NFR-002・EDGE-001 より
 */
import { useState, useEffect, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiPost } from '@/lib/api'
import { Spinner } from '@/components/ui/Spinner'
import type { SuggestedGoal } from '@/hooks/useWannaBeAnalysis'

interface WannaBeAnalysisProps {
  isStreaming: boolean
  streamedText: string
  isDone: boolean
  suggestedGoals: SuggestedGoal[]
  error: string | null
  wannaBeId?: string
  onSaved?: () => void
}

export const WannaBeAnalysis = ({
  isStreaming,
  streamedText,
  isDone,
  suggestedGoals,
  error,
  wannaBeId,
  onSaved,
}: WannaBeAnalysisProps) => {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const candidatesRef = useRef<HTMLDivElement>(null)

  // suggestedGoals が届いたタイミングで全選択状態に初期化 + 候補エリアへスクロール
  useEffect(() => {
    if (suggestedGoals.length === 0) return
    setSelectedIndices(new Set(suggestedGoals.map((_, i) => i)))
    setTimeout(() => {
      candidatesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 100)
  }, [suggestedGoals])

  const { mutate: saveGoals, isPending: isSaving, isSuccess: isSaved } = useMutation({
    mutationFn: () => {
      const goals = suggestedGoals.filter((_, i) => selectedIndices.has(i))
      return apiPost('/api/goals', { wanna_be_id: wannaBeId, goals })
    },
    onSuccess: () => onSaved?.(),
  })

  const toggleGoal = (index: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev)
      next.has(index) ? next.delete(index) : next.add(index)
      return next
    })
  }

  // エラー表示
  if (error) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-300"
      >
        AI機能が現在利用できません。テキストのみ保存されました。
      </div>
    )
  }

  // ストリーミング中 / テキスト蓄積中 / done後（目標候補表示）
  if (isStreaming || streamedText || isDone) {
    return (
      <div className="space-y-3">
        {/* ローディングインジケーター */}
        {isStreaming && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Spinner size="sm" tone="light" />
            <span>AIが考え中...</span>
          </div>
        )}

        {/* ストリーミングテキスト */}
        {streamedText && (
          <div
            className="rounded-2xl p-4 text-sm leading-relaxed text-slate-200"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {streamedText}
            {isStreaming && (
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-emerald-400" />
            )}
          </div>
        )}

        {/* 目標候補（done 後） */}
        {isDone && suggestedGoals.length > 0 && (
          <div ref={candidatesRef}>
            <GoalCandidates
              goals={suggestedGoals}
              selectedIndices={selectedIndices}
              onToggle={toggleGoal}
              onSave={() => saveGoals()}
              isSaving={isSaving}
              isSaved={isSaved}
            />
          </div>
        )}
      </div>
    )
  }

  return null
}

/** 目標候補選択 UI */
const GoalCandidates = ({
  goals,
  selectedIndices,
  onToggle,
  onSave,
  isSaving,
  isSaved,
}: {
  goals: SuggestedGoal[]
  selectedIndices: Set<number>
  onToggle: (i: number) => void
  onSave: () => void
  isSaving: boolean
  isSaved: boolean
}) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">AI提案の目標候補</h3>
      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-slate-300">
        {selectedIndices.size}件選択中
      </span>
    </div>

    {/* REQ-204: 4件超の警告 */}
    {goals.length > 3 && (
      <p className="text-xs text-amber-400">
        3件以内に絞ることをお勧めします（現在 {goals.length} 件）
      </p>
    )}

    <ul className="space-y-2">
      {goals.map((goal, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => onToggle(i)}
            className="w-full rounded-xl px-4 py-3 text-left transition-all active:scale-[0.98]"
            style={{
              background: selectedIndices.has(i)
                ? 'rgba(16,185,129,0.14)'
                : 'rgba(255,255,255,0.05)',
              border: selectedIndices.has(i)
                ? '1px solid rgba(16,185,129,0.4)'
                : '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <p className="text-sm font-semibold text-slate-100">{goal.title}</p>
            {goal.description && (
              <p className="mt-0.5 text-xs text-slate-300">{goal.description}</p>
            )}
          </button>
        </li>
      ))}
    </ul>

    {isSaved ? (
      <p className="text-sm font-medium text-emerald-400">目標を保存しました！</p>
    ) : (
      <button
        type="button"
        onClick={onSave}
        disabled={isSaving || selectedIndices.size === 0}
        className="w-full rounded-xl py-3.5 text-sm font-bold tracking-wide text-white transition-all active:scale-[0.97] disabled:opacity-40"
        style={{
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          boxShadow: selectedIndices.size > 0 ? '0 4px 20px -2px rgba(16,185,129,0.4)' : 'none',
        }}
      >
        {isSaving ? (
          <span className="flex items-center justify-center gap-2">
            <Spinner size="sm" tone="light" />
            <span>保存中...</span>
          </span>
        ) : (
          <span>保存する</span>
        )}
      </button>
    )}
  </div>
)
