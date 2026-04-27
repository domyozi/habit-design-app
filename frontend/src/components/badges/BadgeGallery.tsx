/**
 * バッジギャラリーコンポーネント
 * TASK-0022: バッジ・ゲーミフィケーション表示
 *
 * 表示内容:
 * - 全バッジ定義を一覧表示
 *   - 獲得済み: フルカラー + 獲得日
 *   - 未獲得: グレーアウト + 🔒 + バッジ名表示
 * - バッジタップでモーダル表示（名前・説明・条件）
 * - バッジ数サマリー（獲得数/総数）
 *
 * 🔵 信頼性レベル: REQ-901/902 より
 */
import { useState } from 'react'
import type { BadgeDefinition, UserBadge } from '@/types/interfaces'

interface BadgeGalleryProps {
  badgeDefinitions: BadgeDefinition[]
  earnedBadges: UserBadge[]
}

interface BadgeDetailModalProps {
  badge: BadgeDefinition
  earnedBadge: UserBadge | undefined
  onClose: () => void
}

const BadgeDetailModal = ({ badge, earnedBadge, onClose }: BadgeDetailModalProps) => {
  const conditionLabel = {
    streak: `${badge.condition_value}日連続達成`,
    total_count: `累計${badge.condition_value}回達成`,
    weekly_rate: `週間達成率${badge.condition_value}%以上`,
  }[badge.condition_type]

  return (
    <div
      data-testid="badge-detail-modal"
      role="dialog"
      aria-modal="true"
      aria-label={badge.name}
      className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8 sm:items-center"
    >
      {/* オーバーレイ */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* モーダルカード */}
      <div
        className="relative w-full max-w-sm rounded-3xl p-6"
        style={{
          background: 'rgba(15,20,40,0.95)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 24px 64px -12px rgba(0,0,0,0.8)',
        }}
      >
        {/* アイコン */}
        <div className="mb-4 flex justify-center">
          <div
            className={[
              'flex h-16 w-16 items-center justify-center rounded-2xl text-3xl',
              earnedBadge ? 'bg-amber-400/20' : 'bg-white/[0.06]',
            ].join(' ')}
            style={earnedBadge ? { boxShadow: '0 0 20px rgba(251,191,36,0.3)' } : {}}
          >
            {earnedBadge ? (badge.icon_name ?? '🏆') : '🔒'}
          </div>
        </div>

        {/* テキスト */}
        <div className="text-center">
          {earnedBadge ? (
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-400">
              獲得済み
            </p>
          ) : (
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              未獲得
            </p>
          )}
          <h2 className="text-xl font-bold text-white">{badge.name}</h2>
          {badge.description && (
            <p className="mt-1 text-sm text-slate-400">{badge.description}</p>
          )}
          <p className="mt-3 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-slate-400">
            条件: {conditionLabel}
          </p>
          {earnedBadge && (
            <p className="mt-2 text-xs text-slate-500">
              獲得日: {new Date(earnedBadge.earned_at).toLocaleDateString('ja-JP')}
            </p>
          )}
        </div>

        {/* 閉じるボタン */}
        <button
          data-testid="badge-modal-close"
          type="button"
          className="mt-5 w-full rounded-xl bg-white/[0.08] py-3 text-sm font-semibold text-white ring-1 ring-white/[0.10] transition-colors hover:bg-white/[0.12]"
          onClick={onClose}
        >
          閉じる
        </button>
      </div>
    </div>
  )
}

export const BadgeGallery = ({ badgeDefinitions, earnedBadges }: BadgeGalleryProps) => {
  const [selectedBadge, setSelectedBadge] = useState<BadgeDefinition | null>(null)

  const earnedBadgeMap = new Map(earnedBadges.map((ub) => [ub.badge_id, ub]))
  const earnedCount = badgeDefinitions.filter((bd) => earnedBadgeMap.has(bd.id)).length

  const selectedEarned = selectedBadge ? earnedBadgeMap.get(selectedBadge.id) : undefined

  return (
    <>
      <div
        className="rounded-2xl p-5"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        {/* ヘッダー */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">
              獲得バッジ
            </h2>
            <p className="mt-1 text-xs text-slate-300">条件を開くと獲得基準を確認できます。</p>
          </div>
          <span data-testid="badge-summary" className="text-sm font-bold text-white">
            {earnedCount}/{badgeDefinitions.length}バッジ獲得
          </span>
        </div>

        {/* バッジグリッド */}
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
          {badgeDefinitions.map((badge) => {
            const earned = earnedBadgeMap.get(badge.id)
            return (
              <button
                key={badge.id}
                data-testid={`badge-${badge.id}`}
                type="button"
                onClick={() => setSelectedBadge(badge)}
                className="flex flex-col items-center gap-1.5 rounded-xl p-2 transition hover:bg-white/[0.06]"
                aria-label={`${badge.name}${earned ? '（獲得済み）' : '（未獲得）'}`}
              >
                <div
                  className={[
                    'flex h-10 w-10 items-center justify-center rounded-xl text-xl',
                    earned ? 'bg-amber-400/20' : 'bg-white/[0.05]',
                  ].join(' ')}
                  style={earned ? { boxShadow: '0 0 12px rgba(251,191,36,0.25)' } : {}}
                >
                  {earned ? (badge.icon_name ?? '🏆') : '🔒'}
                </div>
                <span
                  className={[
                    'max-w-full truncate text-center text-[9px] leading-tight',
                    earned ? 'text-slate-300' : 'text-slate-400',
                  ].join(' ')}
                >
                  {badge.name}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* バッジ詳細モーダル */}
      {selectedBadge && (
        <BadgeDetailModal
          badge={selectedBadge}
          earnedBadge={selectedEarned}
          onClose={() => setSelectedBadge(null)}
        />
      )}
    </>
  )
}
