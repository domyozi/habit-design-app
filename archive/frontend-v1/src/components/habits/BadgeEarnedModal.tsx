/**
 * バッジ獲得通知モーダル
 * TASK-0015: 習慣チェックリスト操作UI
 *
 * - バッジ名・説明を表示
 * - フェードインアニメーション
 * - 3秒後に自動クローズ or 「閉じる」ボタン
 *
 * 🔵 信頼性レベル: REQ-901/user-stories 3.2 より
 */
import { useEffect } from 'react'

interface BadgeEarnedModalProps {
  badgeName: string
  badgeDescription?: string
  onClose: () => void
}

export const BadgeEarnedModal = ({
  badgeName,
  badgeDescription,
  onClose,
}: BadgeEarnedModalProps) => {
  // 3秒後に自動クローズ
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="バッジ獲得"
      className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8 sm:items-center"
    >
      {/* オーバーレイ */}
      <div
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* モーダルカード */}
      <div className="relative w-full max-w-sm animate-[fadeInUp_0.3s_ease-out] rounded-3xl bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        {/* バッジアイコン */}
        <div className="mb-4 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-3xl">
            🏆
          </div>
        </div>

        {/* テキスト */}
        <div className="text-center">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-600">
            バッジ獲得！
          </p>
          <h2 className="text-xl font-bold text-slate-900">{badgeName}</h2>
          {badgeDescription && (
            <p className="mt-1 text-sm text-slate-500">{badgeDescription}</p>
          )}
        </div>

        {/* 閉じるボタン */}
        <button
          type="button"
          className="mt-5 w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
          onClick={onClose}
        >
          閉じる
        </button>
      </div>
    </div>
  )
}
