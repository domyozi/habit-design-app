/**
 * HabitCheckbox.tsx テスト
 * TASK-0015: 習慣チェックリスト操作UI
 *
 * テストケース:
 * 1. 未完了状態のチェックボックスが正しく表示される
 * 2. 完了状態のチェックボックスが正しく表示される
 * 3. クリックでonToggleが呼ばれる（未完了→完了）
 * 4. クリックでonToggleが呼ばれる（完了→未完了）
 * 5. isPending中はボタンがdisabledになる
 * 6. タップ領域が44×44px以上である
 *
 * 🔵 信頼性レベル: REQ-404/501/NFR-202 より
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HabitCheckbox } from '@/components/habits/HabitCheckbox'

describe('HabitCheckbox', () => {
  const defaultProps = {
    habitId: 'habit-1',
    habitTitle: 'ランニング30分',
    isCompleted: false,
    isPending: false,
    onToggle: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * テストケース1: 未完了状態の表示
   * Given: isCompleted=false の習慣
   * When: HabitCheckbox をレンダリングする
   * Then: チェックアイコンが表示されない
   * 🔵 REQ-501 より
   */
  it('未完了状態のとき、チェックアイコンが表示されない', () => {
    render(<HabitCheckbox {...defaultProps} isCompleted={false} />)
    const btn = screen.getByRole('button')
    expect(btn).not.toHaveAttribute('aria-pressed', 'true')
  })

  /**
   * テストケース2: 完了状態の表示
   * Given: isCompleted=true の習慣
   * When: HabitCheckbox をレンダリングする
   * Then: 完了状態のスタイルが適用される
   * 🔵 REQ-501 より
   */
  it('完了状態のとき、aria-pressed=true が設定される', () => {
    render(<HabitCheckbox {...defaultProps} isCompleted={true} />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('aria-pressed', 'true')
  })

  /**
   * テストケース3: クリックで onToggle が呼ばれる（未完了→完了）
   * Given: isCompleted=false の習慣
   * When: チェックボックスをクリックする
   * Then: onToggle('habit-1', true) が呼ばれる
   * 🔵 REQ-404 より
   */
  it('未完了状態でクリックすると onToggle(habitId, true) が呼ばれる', () => {
    render(<HabitCheckbox {...defaultProps} isCompleted={false} />)
    fireEvent.click(screen.getByRole('button'))
    expect(defaultProps.onToggle).toHaveBeenCalledWith('habit-1', true)
    expect(defaultProps.onToggle).toHaveBeenCalledTimes(1)
  })

  /**
   * テストケース4: クリックで onToggle が呼ばれる（完了→未完了）
   * Given: isCompleted=true の習慣
   * When: チェックボックスをクリックする
   * Then: onToggle('habit-1', false) が呼ばれる
   * 🔵 REQ-404 より
   */
  it('完了状態でクリックすると onToggle(habitId, false) が呼ばれる', () => {
    render(<HabitCheckbox {...defaultProps} isCompleted={true} />)
    fireEvent.click(screen.getByRole('button'))
    expect(defaultProps.onToggle).toHaveBeenCalledWith('habit-1', false)
  })

  /**
   * テストケース5: isPending中はボタンがdisabled
   * Given: isPending=true
   * When: HabitCheckbox をレンダリングする
   * Then: ボタンが disabled になり、クリックしても onToggle が呼ばれない
   * 🔵 NFR-001 より
   */
  it('isPendingのとき、ボタンがdisabledになりクリックできない', () => {
    render(<HabitCheckbox {...defaultProps} isPending={true} />)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(defaultProps.onToggle).not.toHaveBeenCalled()
  })

  /**
   * テストケース6: タップ領域が44×44px以上
   * Given: HabitCheckbox コンポーネント
   * When: レンダリングする
   * Then: ボタンに min-w-[44px] min-h-[44px] クラスが付与されている
   * 🔵 NFR-202 より
   */
  it('ボタンに min-w-[44px] min-h-[44px] クラスが付与されている', () => {
    render(<HabitCheckbox {...defaultProps} />)
    const btn = screen.getByRole('button')
    expect(btn.className).toMatch(/min-w-\[44px\]/)
    expect(btn.className).toMatch(/min-h-\[44px\]/)
  })
})
