/**
 * MonthlyStats.tsx テスト
 * TASK-0021: 習慣トラッキング可視化
 *
 * テストケース:
 * 1. 今週の達成率が表示される
 * 2. 今月の達成率が表示される
 * 3. 達成数/総習慣数が表示される
 * 4. ゼロデータでも表示が壊れない
 *
 * 🔵 信頼性レベル: REQ-505 より
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MonthlyStats } from '@/components/dashboard/MonthlyStats'

describe('MonthlyStats', () => {
  const defaultProps = {
    weeklyRate: 75,
    monthlyRate: 68,
    weeklyCompleted: 15,
    weeklyTotal: 20,
    monthlyCompleted: 58,
    monthlyTotal: 85,
  }

  /**
   * テストケース1: 今週の達成率が表示される
   * Given: weeklyRate=75 のデータ
   * When: MonthlyStats をレンダリングする
   * Then: "75%" が画面に表示される
   * 🔵 REQ-505 より
   */
  it('今週の達成率が表示される', () => {
    render(<MonthlyStats {...defaultProps} />)
    expect(screen.getByTestId('weekly-rate')).toHaveTextContent('75%')
  })

  /**
   * テストケース2: 今月の達成率が表示される
   * Given: monthlyRate=68 のデータ
   * When: MonthlyStats をレンダリングする
   * Then: "68%" が画面に表示される
   * 🔵 REQ-505 より
   */
  it('今月の達成率が表示される', () => {
    render(<MonthlyStats {...defaultProps} />)
    expect(screen.getByTestId('monthly-rate')).toHaveTextContent('68%')
  })

  /**
   * テストケース3: 達成数/総習慣数が表示される
   * Given: weeklyCompleted=15, weeklyTotal=20 のデータ
   * When: MonthlyStats をレンダリングする
   * Then: "15" と "20" の両方が表示される
   */
  it('週間の達成数と総習慣数が表示される', () => {
    render(<MonthlyStats {...defaultProps} />)
    const weekSection = screen.getByTestId('weekly-section')
    expect(weekSection).toHaveTextContent('15')
    expect(weekSection).toHaveTextContent('20')
  })

  /**
   * テストケース4: ゼロデータでも表示が壊れない
   * Given: 全て0のデータ
   * When: MonthlyStats をレンダリングする
   * Then: "0%" が表示されてエラーにならない
   */
  it('ゼロデータでも表示が壊れない', () => {
    render(<MonthlyStats weeklyRate={0} monthlyRate={0} weeklyCompleted={0} weeklyTotal={0} monthlyCompleted={0} monthlyTotal={0} />)
    expect(screen.getByTestId('weekly-rate')).toHaveTextContent('0%')
    expect(screen.getByTestId('monthly-rate')).toHaveTextContent('0%')
  })
})
