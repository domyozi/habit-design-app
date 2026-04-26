import { render, screen, fireEvent } from '@testing-library/react'
import { KgiCard } from './KgiCard'
import type { GoalWithKgi } from '../types'

const baseGoal: GoalWithKgi = {
  id: 'goal-1',
  user_id: 'user-1',
  title: 'テスト目標',
  display_order: 0,
  is_active: true,
  is_kgi: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const kgiGoal: GoalWithKgi = {
  ...baseGoal,
  is_kgi: true,
  metric_type: 'numeric',
  target_value: 100,
  current_value: 72,
  unit: 'km',
  target_date: '2026-12-31',
  achievement_rate: 72,
  days_remaining: 260,
  is_expired: false,
}

describe('KgiCard', () => {
  // TC1: 通常 Goal にプログレスバーなし
  test('is_kgi=false のとき progressbar が表示されない', () => {
    render(<KgiCard goal={baseGoal} />)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  // TC2: achievement_rate=72 → width: 72%
  test('achievement_rate=72 のとき progressbar の width が 72%', () => {
    render(<KgiCard goal={kgiGoal} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveStyle({ width: '72%' })
  })

  // TC3: 期限超過バッジ
  test('is_expired=true のとき「期限超過」ラベルが表示される', () => {
    const expiredGoal = { ...kgiGoal, is_expired: true, days_remaining: -5 }
    render(<KgiCard goal={expiredGoal} />)
    expect(screen.getByText('期限超過')).toBeInTheDocument()
  })

  // TC4: 残り日数（正）
  test('days_remaining=5 のとき「残り 5 日」が表示される', () => {
    const goal = { ...kgiGoal, days_remaining: 5 }
    render(<KgiCard goal={goal} />)
    expect(screen.getByText('残り 5 日')).toBeInTheDocument()
  })

  // TC5: 超過日数（負）
  test('days_remaining=-3 のとき「3 日超過」が表示される', () => {
    const goal = { ...kgiGoal, days_remaining: -3, is_expired: true }
    render(<KgiCard goal={goal} />)
    expect(screen.getByText('3 日超過')).toBeInTheDocument()
  })

  // TC6: ダイアログが開く
  test('「現在値を更新」ボタンをクリックするとダイアログが開く', () => {
    render(<KgiCard goal={kgiGoal} />)
    fireEvent.click(screen.getByText('現在値を更新'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  // TC7: コールバック呼び出し
  test('ダイアログで値を入力して保存するとコールバックが呼ばれる', () => {
    const onUpdate = vi.fn()
    render(<KgiCard goal={kgiGoal} onCurrentValueUpdate={onUpdate} />)
    fireEvent.click(screen.getByText('現在値を更新'))
    const input = screen.getByLabelText('現在値')
    fireEvent.change(input, { target: { value: '42' } })
    fireEvent.click(screen.getByText('保存'))
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith('goal-1', 42)
  })
})
