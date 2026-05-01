/**
 * CalendarView.tsx テスト
 * TASK-0021: 習慣トラッキング可視化
 *
 * テストケース:
 * 1. 全達成の日付セルが緑で表示される
 * 2. 一部達成の日付セルが黄で表示される
 * 3. 未達成ありの日付セルが赤で表示される
 * 4. 未記録の日付セルがグレーで表示される
 * 5. 前月ボタンで月が変わる
 * 6. 次月ボタンで月が変わる
 * 7. 7列グリッドで表示される（モバイル対応）
 *
 * 🟡 信頼性レベル: REQ-506 一般的な習慣アプリから妥当な推測
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CalendarView } from '@/components/dashboard/CalendarView'
import type { DayStatus } from '@/components/dashboard/CalendarView'

describe('CalendarView', () => {
  const buildDayStatuses = (overrides: Record<string, DayStatus> = {}): Record<string, DayStatus> => ({
    '2026-04-01': 'all',
    '2026-04-02': 'partial',
    '2026-04-03': 'none',
    ...overrides,
  })

  const defaultProps = {
    year: 2026,
    month: 4,
    dayStatuses: buildDayStatuses(),
    onMonthChange: vi.fn(),
  }

  /**
   * テストケース1: 全達成の日付セルが緑で表示される
   * Given: 2026-04-01が全達成(all)
   * When: CalendarView をレンダリングする
   * Then: 該当セルに bg-green-200 クラスが付く
   * 🟡 REQ-506 より
   */
  it('全達成の日にちセルに bg-green-200 クラスが付く', () => {
    render(<CalendarView {...defaultProps} />)
    const cell = screen.getByTestId('day-2026-04-01')
    expect(cell.className).toMatch(/bg-green-200/)
  })

  /**
   * テストケース2: 一部達成の日付セルが黄で表示される
   * Given: 2026-04-02が一部達成(partial)
   * When: CalendarView をレンダリングする
   * Then: 該当セルに bg-yellow-200 クラスが付く
   * 🟡 REQ-506 より
   */
  it('一部達成の日にちセルに bg-yellow-200 クラスが付く', () => {
    render(<CalendarView {...defaultProps} />)
    const cell = screen.getByTestId('day-2026-04-02')
    expect(cell.className).toMatch(/bg-yellow-200/)
  })

  /**
   * テストケース3: 未達成ありの日付セルが赤で表示される
   * Given: 2026-04-03が未達成(none)
   * When: CalendarView をレンダリングする
   * Then: 該当セルに bg-red-100 クラスが付く
   * 🟡 REQ-506 より
   */
  it('未達成ありの日にちセルに bg-red-100 クラスが付く', () => {
    render(<CalendarView {...defaultProps} />)
    const cell = screen.getByTestId('day-2026-04-03')
    expect(cell.className).toMatch(/bg-red-100/)
  })

  /**
   * テストケース4: 未記録の日付セルがグレーで表示される
   * Given: 2026-04-15が未記録(未設定)
   * When: CalendarView をレンダリングする
   * Then: 該当セルに bg-slate-100 クラスが付く
   */
  it('未記録の日にちセルに bg-slate-100 クラスが付く', () => {
    render(<CalendarView {...defaultProps} />)
    const cell = screen.getByTestId('day-2026-04-15')
    expect(cell.className).toMatch(/bg-slate-100/)
  })

  /**
   * テストケース5: 前月ボタンで onMonthChange が呼ばれる
   * Given: 2026年4月を表示中
   * When: 前月ボタンをクリックする
   * Then: onMonthChange(2026, 3) が呼ばれる
   */
  it('前月ボタンで onMonthChange(2026, 3) が呼ばれる', () => {
    const onMonthChange = vi.fn()
    render(<CalendarView {...defaultProps} onMonthChange={onMonthChange} />)
    fireEvent.click(screen.getByTestId('prev-month-button'))
    expect(onMonthChange).toHaveBeenCalledWith(2026, 3)
  })

  /**
   * テストケース6: 次月ボタンで onMonthChange が呼ばれる
   * Given: 2026年4月を表示中
   * When: 次月ボタンをクリックする
   * Then: onMonthChange(2026, 5) が呼ばれる
   */
  it('次月ボタンで onMonthChange(2026, 5) が呼ばれる', () => {
    const onMonthChange = vi.fn()
    render(<CalendarView {...defaultProps} onMonthChange={onMonthChange} />)
    fireEvent.click(screen.getByTestId('next-month-button'))
    expect(onMonthChange).toHaveBeenCalledWith(2026, 5)
  })

  /**
   * テストケース7: 7列グリッドで表示される
   * Given: CalendarView コンポーネント
   * When: レンダリングする
   * Then: grid-cols-7 クラスが付いたグリッドがある
   * 🔵 NFR-201 より（モバイル対応）
   */
  it('カレンダーグリッドが grid-cols-7 クラスを持つ', () => {
    render(<CalendarView {...defaultProps} />)
    const grid = screen.getByTestId('calendar-grid')
    expect(grid.className).toMatch(/grid-cols-7/)
  })
})
