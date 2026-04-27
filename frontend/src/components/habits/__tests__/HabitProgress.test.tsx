/**
 * HabitProgress.tsx テスト
 * TASK-0021: 習慣トラッキング可視化
 *
 * テストケース:
 * 1. 達成率80%以上のとき緑の進捗バーが表示される
 * 2. 達成率50〜79%のとき黄の進捗バーが表示される
 * 3. 達成率50%未満のとき赤の進捗バーが表示される
 * 4. ストリーク日数が炎アイコン付きで表示される
 * 5. ストリーク0のとき炎アイコンが表示されない
 * 6. 達成率が進捗バー幅に反映される
 *
 * 🔵 信頼性レベル: REQ-504 より
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HabitProgress } from '@/components/habits/HabitProgress'

describe('HabitProgress', () => {
  const defaultProps = {
    habitId: 'habit-1',
    habitTitle: 'ランニング30分',
    achievementRate: 80,
    currentStreak: 5,
  }

  /**
   * テストケース1: 達成率80%以上→緑の進捗バー
   * Given: 達成率80%の習慣データ
   * When: HabitProgress コンポーネントをレンダリングする
   * Then: 緑の進捗バーが表示される
   * 🔵 REQ-504 より
   */
  it('達成率80%以上のとき、緑の進捗バーが表示される', () => {
    render(<HabitProgress {...defaultProps} achievementRate={80} />)
    const bar = screen.getByTestId('progress-bar')
    expect(bar.className).toMatch(/bg-green-500/)
  })

  /**
   * テストケース2: 達成率50〜79%→黄の進捗バー
   * Given: 達成率65%の習慣データ
   * When: HabitProgress コンポーネントをレンダリングする
   * Then: 黄の進捗バーが表示される
   * 🔵 REQ-504 より
   */
  it('達成率50〜79%のとき、黄の進捗バーが表示される', () => {
    render(<HabitProgress {...defaultProps} achievementRate={65} />)
    const bar = screen.getByTestId('progress-bar')
    expect(bar.className).toMatch(/bg-yellow-500/)
  })

  /**
   * テストケース3: 達成率50%未満→赤の進捗バー
   * Given: 達成率30%の習慣データ
   * When: HabitProgress コンポーネントをレンダリングする
   * Then: 赤の進捗バーが表示される
   * 🔵 REQ-504 より
   */
  it('達成率50%未満のとき、赤の進捗バーが表示される', () => {
    render(<HabitProgress {...defaultProps} achievementRate={30} />)
    const bar = screen.getByTestId('progress-bar')
    expect(bar.className).toMatch(/bg-red-500/)
  })

  /**
   * テストケース4: ストリーク日数が炎アイコン付きで表示される
   * Given: ストリーク5日の習慣データ
   * When: HabitProgress コンポーネントをレンダリングする
   * Then: "5" が含まれた炎アイコン表示がある
   * 🔵 REQ-502 より
   */
  it('ストリーク日数が炎アイコン付きで表示される', () => {
    render(<HabitProgress {...defaultProps} currentStreak={5} />)
    const streak = screen.getByTestId('streak-display')
    expect(streak).toHaveTextContent('5')
    expect(streak.textContent).toMatch(/🔥/)
  })

  /**
   * テストケース5: ストリーク0のとき炎アイコンが表示されない
   * Given: ストリーク0の習慣データ
   * When: HabitProgress コンポーネントをレンダリングする
   * Then: streak-display が存在しない
   */
  it('ストリーク0のとき、炎アイコンが表示されない', () => {
    render(<HabitProgress {...defaultProps} currentStreak={0} />)
    expect(screen.queryByTestId('streak-display')).toBeNull()
  })

  /**
   * テストケース6: 達成率が進捗バー幅に反映される
   * Given: 達成率75%の習慣データ
   * When: HabitProgress コンポーネントをレンダリングする
   * Then: 進捗バーの width スタイルが 75% になっている
   */
  it('達成率が進捗バーの幅に反映される', () => {
    render(<HabitProgress {...defaultProps} achievementRate={75} />)
    const bar = screen.getByTestId('progress-bar')
    expect(bar).toHaveStyle({ width: '75%' })
  })
})
