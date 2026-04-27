/**
 * 音声入力モーダルコンポーネント
 * TASK-0019: 音声入力UI実装
 *
 * 機能:
 * - 認識テキストのリアルタイム表示
 * - AI解析中スピナー
 * - type=unknown（EDGE-003）: 「どの操作ですか？」手動選択UI
 * - type=checklist/journaling/daily_report: 結果メッセージ表示
 *
 * 🔵 信頼性レベル: REQ-402/403・EDGE-003 より
 */
import { Spinner } from '@/components/ui/Spinner'

type VoiceResultType = 'checklist' | 'journaling' | 'daily_report' | 'unknown'

interface VoiceResult {
  type: VoiceResultType
  message?: string
}

interface VoiceInputModalProps {
  transcript: string
  isAnalyzing: boolean
  result: VoiceResult | null
  onClose: () => void
  onSubmit?: () => void
  onResend?: () => void
  onSelectAction: (action: VoiceResultType) => void
}

export const VoiceInputModal = ({
  transcript,
  isAnalyzing,
  result,
  onClose,
  onSubmit,
  onResend,
  onSelectAction,
}: VoiceInputModalProps) => {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl bg-white px-5 py-6 shadow-xl sm:rounded-3xl">
        {/* ヘッダー */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">音声入力</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {/* 認識テキスト */}
        {transcript && (
          <div data-testid="transcript-box" className="mb-4 rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-sm text-slate-700">{transcript}</p>
          </div>
        )}

        {!isAnalyzing && !result && transcript && onSubmit && (
          <button
            type="button"
            onClick={onSubmit}
            className="mb-4 w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
          >
            送信
          </button>
        )}

        {/* AI解析中 */}
        {isAnalyzing && (
          <div className="flex items-center gap-2 py-3">
            <Spinner size="sm" tone="dark" />
            <span className="text-sm text-slate-500">AIが解析中...</span>
          </div>
        )}

        {/* 結果表示 */}
        {result && !isAnalyzing && (
          <>
            {result.type === 'unknown' ? (
              /* EDGE-003: AI判断不能時の手動選択 */
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-700">どの操作ですか？</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectAction('checklist')}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    チェックリスト
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectAction('journaling')}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    ジャーナル
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectAction('daily_report')}
                    className="col-span-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    日報
                  </button>
                </div>
              </div>
            ) : (
              /* 成功 / 再送メッセージ */
              <div className="space-y-3">
                <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                  <p className="text-sm font-medium text-emerald-700">
                    {result.message ?? (
                      result.type === 'checklist'
                        ? '習慣を更新しました'
                        : result.type === 'journaling'
                        ? 'ジャーナルに保存しました'
                        : '日報を保存しました'
                    )}
                  </p>
                </div>
                {/* 「再送してください」メッセージの場合は再送ボタンを表示 */}
                {result.message?.includes('再送') && onResend && (
                  <button
                    type="button"
                    onClick={onResend}
                    className="w-full rounded-2xl border border-emerald-300 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
                  >
                    再送する
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
