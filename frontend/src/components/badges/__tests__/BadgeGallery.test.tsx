/**
 * BadgeGallery.tsx テスト
 * TASK-0022: バッジ・ゲーミフィケーション表示
 *
 * テストケース:
 * 1. 獲得済みバッジがフルカラーで表示される
 * 2. 未獲得バッジがグレーアウト（opacity-30）で表示される
 * 3. 合計バッジ数サマリーが表示される
 * 4. バッジクリックで詳細モーダルが開く
 * 5. モーダルにバッジ名・説明・獲得条件が表示される
 * 6. モーダルの閉じるボタンで閉じられる
 *
 * 🔵 信頼性レベル: REQ-901/902 より
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BadgeGallery } from '@/components/badges/BadgeGallery'
import type { BadgeDefinition, UserBadge } from '@/types/interfaces'

describe('BadgeGallery', () => {
  const badgeDefinitions: BadgeDefinition[] = [
    {
      id: 'streak_7',
      name: '7日連続達成',
      description: '7日間連続で習慣を達成しました',
      condition_type: 'streak',
      condition_value: 7,
      icon_name: '🔥',
    },
    {
      id: 'streak_30',
      name: '30日連続達成',
      description: '30日間連続で習慣を達成しました',
      condition_type: 'streak',
      condition_value: 30,
      icon_name: '⭐',
    },
    {
      id: 'total_100',
      name: '累計100回達成',
      description: '習慣を合計100回達成しました',
      condition_type: 'total_count',
      condition_value: 100,
      icon_name: '💯',
    },
  ]

  const earnedBadges: UserBadge[] = [
    {
      id: 'ub-1',
      user_id: 'user-1',
      badge_id: 'streak_7',
      habit_id: 'habit-1',
      earned_at: '2026-04-10T10:00:00Z',
      badge: badgeDefinitions[0],
    },
  ]

  const defaultProps = {
    badgeDefinitions,
    earnedBadges,
  }

  /**
   * テストケース1: 獲得済みバッジがフルカラーで表示される
   * Given: streak_7バッジを獲得済み
   * When: BadgeGallery をレンダリングする
   * Then: streak_7のバッジが opacity-30 クラスを持たない
   * 🔵 REQ-902 より
   */
  it('獲得済みバッジがフルカラーで表示される', () => {
    render(<BadgeGallery {...defaultProps} />)
    const badge = screen.getByTestId('badge-streak_7')
    expect(badge.className).not.toMatch(/opacity-30/)
  })

  /**
   * テストケース2: 未獲得バッジがグレーアウトで表示される
   * Given: streak_30, total_100 が未獲得
   * When: BadgeGallery をレンダリングする
   * Then: 該当バッジに opacity-30 クラスが付く
   * 🔵 REQ-902 より
   */
  it('未獲得バッジに（未獲得）aria-label が付く', () => {
    render(<BadgeGallery {...defaultProps} />)
    const badge30 = screen.getByTestId('badge-streak_30')
    const badge100 = screen.getByTestId('badge-total_100')
    expect(badge30.getAttribute('aria-label')).toMatch(/未獲得/)
    expect(badge100.getAttribute('aria-label')).toMatch(/未獲得/)
  })

  /**
   * テストケース3: バッジ数サマリーが表示される
   * Given: 3件中1件獲得
   * When: BadgeGallery をレンダリングする
   * Then: "1/3" が表示される
   */
  it('バッジ数サマリーが表示される', () => {
    render(<BadgeGallery {...defaultProps} />)
    expect(screen.getByTestId('badge-summary')).toHaveTextContent('1/3')
  })

  /**
   * テストケース4: バッジクリックでモーダルが開く
   * Given: streak_7 バッジ
   * When: バッジをクリックする
   * Then: モーダルが表示される
   */
  it('バッジクリックでモーダルが開く', () => {
    render(<BadgeGallery {...defaultProps} />)
    fireEvent.click(screen.getByTestId('badge-streak_7'))
    expect(screen.getByTestId('badge-detail-modal')).toBeInTheDocument()
  })

  /**
   * テストケース5: モーダルにバッジ名・説明が表示される
   * Given: streak_7 バッジをクリック済み
   * When: モーダルが開いた状態
   * Then: バッジ名と説明が表示される
   */
  it('モーダルにバッジ名と説明が表示される', () => {
    render(<BadgeGallery {...defaultProps} />)
    fireEvent.click(screen.getByTestId('badge-streak_7'))
    const modal = screen.getByTestId('badge-detail-modal')
    expect(modal).toHaveTextContent('7日連続達成')
    expect(modal).toHaveTextContent('7日間連続で習慣を達成しました')
  })

  /**
   * テストケース6: モーダルの閉じるボタンで閉じられる
   * Given: モーダルが開いている
   * When: 閉じるボタンをクリックする
   * Then: モーダルが非表示になる
   */
  it('閉じるボタンでモーダルが閉じる', () => {
    render(<BadgeGallery {...defaultProps} />)
    fireEvent.click(screen.getByTestId('badge-streak_7'))
    expect(screen.getByTestId('badge-detail-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('badge-modal-close'))
    expect(screen.queryByTestId('badge-detail-modal')).toBeNull()
  })
})
