/**
 * 週次レビューフィードバック表示コンポーネント
 * TASK-0020: 週次レビュー画面実装
 * Design: AIDesigner dark premium — run 1137b5ae (weekly-review)
 *
 * 機能:
 * - SSEチャンクをリアルタイムでテキスト表示（REQ-603）
 * - done時に AI提案アクション一覧を表示（REQ-303）
 * - AI_UNAVAILABLE エラーメッセージ（EDGE-001）
 *
 * 🔵 信頼性レベル: REQ-602/603・EDGE-001 より
 */
import { AIActionProposal } from '@/components/ai/AIActionProposal'
import type { AIAction } from '@/components/ai/AIActionProposal'
import { Spinner } from '@/components/ui/Spinner'

interface WeeklyReviewFeedbackProps {
  chunks: string[]
  isDone: boolean
  isStreaming: boolean
  actions: AIAction[]
  error: string | null
  onActionApproved?: () => void
}

export const WeeklyReviewFeedback = ({
  chunks,
  isDone,
  isStreaming,
  actions,
  error,
  onActionApproved,
}: WeeklyReviewFeedbackProps) => {
  const streamedText = chunks.join('')

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-3"
      >
        <p className="text-sm text-rose-300">AIが現在利用できません。後でお試しください。</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* AI ストリーミングパネル */}
      {(isStreaming || streamedText) && (
        <div>
          <div className="mb-3 flex items-center gap-2 px-1">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-500 to-teal-300">
              <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <h2 className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-300">
              AI 評価レポート
              {isStreaming && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />}
            </h2>
          </div>
          <div
            className="rounded-2xl p-5"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderLeft: '2px solid rgba(16,185,129,0.5)',
            }}
          >
            {isStreaming && !streamedText && (
              <div className="flex items-center gap-2">
                <Spinner size="sm" tone="dark" />
                <span className="text-sm text-slate-400">AIが今週のデータを分析中...</span>
              </div>
            )}
            {streamedText && (
              <p className="text-sm font-medium leading-relaxed text-slate-300">
                {streamedText}
                {isStreaming && (
                  <span
                    className="ml-1 inline-block h-3.5 w-1.5 translate-y-[2px] bg-emerald-400"
                    style={{ animation: 'blink 1s step-end infinite' }}
                  />
                )}
              </p>
            )}
          </div>
        </div>
      )}

      {/* AI提案アクション（スワイプ式） */}
      {isDone && actions.length > 0 && (
        <div>
          <h3 className="mb-4 flex items-center justify-between px-1 text-xs font-bold text-slate-400">
            <span>AI 提案アクション ({actions.length})</span>
            <span className="flex items-center gap-1 text-[10px] font-normal text-slate-500">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              スワイプ
            </span>
          </h3>
          <div className="hide-scrollbar -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4">
            {actions.map(action => (
              <AIActionProposal
                key={action.id}
                action={action}
                onApproved={onActionApproved}
              />
            ))}
          </div>
        </div>
      )}

      {/* 完了・提案なし */}
      {isDone && actions.length === 0 && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
          <p className="text-sm text-emerald-300">今週の習慣は最適な状態です。このまま継続しましょう！</p>
        </div>
      )}

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  )
}
