/**
 * GoalList.tsx テスト
 * TASK-0018: 長期目標管理画面実装
 *
 * テストケース:
 * 1. 2件の目標タイトルが表示される
 * 2. 目標の説明が表示される
 * 3. 「3件まで設定可能」の残枠表示が出る
 * 4. 目標が0件のとき空状態メッセージが表示される
 *
 * 🔵 信頼性レベル: REQ-203/204 より
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GoalList } from '@/components/wanna_be/GoalList'

const mockGoals = [
  {
    id: 'g1',
    title: '早起きの習慣化',
    description: '毎朝6時起床を定着させる',
    habit_count: 2,
  },
  {
    id: 'g2',
    title: '英語力向上',
    description: 'ビジネス英語でのプレゼン習得',
    habit_count: 1,
  },
]

describe('GoalList', () => {
  /**
   * テストケース1: 2件の目標タイトルが表示される
   * Given: 2件の目標データ
   * When: GoalList をレンダリングする
   * Then: 2件の目標タイトルが表示される
   * 🔵 REQ-203 より
   */
  it('2件の目標タイトルが表示される', () => {
    render(<GoalList goals={mockGoals} />)

    expect(screen.getByText('早起きの習慣化')).toBeInTheDocument()
    expect(screen.getByText('英語力向上')).toBeInTheDocument()
  })

  /**
   * テストケース2: 目標の説明が表示される
   * Given: description を含む目標データ
   * When: GoalList をレンダリングする
   * Then: 説明テキストが表示される
   * 🔵 REQ-203 より
   */
  it('目標の説明が表示される', () => {
    render(<GoalList goals={mockGoals} />)

    expect(screen.getByText('毎朝6時起床を定着させる')).toBeInTheDocument()
  })

  /**
   * テストケース3: 「3件まで設定可能」の残枠が表示される
   * Given: 2件の目標（最大3件中）
   * When: GoalList をレンダリングする
   * Then: 現在の件数と上限が表示される
   * 🔵 REQ-204 より
   */
  it('現在の目標数と上限が表示される', () => {
    render(<GoalList goals={mockGoals} />)

    expect(screen.getByText(/2 \/ 3/)).toBeInTheDocument()
  })

  /**
   * テストケース4: 目標が0件のとき空状態メッセージが表示される
   * Given: 目標が0件
   * When: GoalList をレンダリングする
   * Then: 「目標がまだ設定されていません」が表示される
   */
  it('目標が0件のとき空状態メッセージが表示される', () => {
    render(<GoalList goals={[]} />)

    expect(screen.getByText(/目標がまだ設定されていません/)).toBeInTheDocument()
  })
})
