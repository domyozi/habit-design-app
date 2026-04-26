import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { KpiCreateForm } from './KpiCreateForm'
import * as api from '../lib/api'

describe('KpiCreateForm', () => {
  const baseProps = {
    goalId: 'goal-1',
    onSuccess: vi.fn(),
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // TC3: percentage 型で target_value=101 のときエラー表示
  test('percentage 型で target_value=101 のときエラー表示', async () => {
    render(<KpiCreateForm {...baseProps} />)

    // metric_type を percentage に変更
    fireEvent.change(screen.getByLabelText('指標タイプ'), {
      target: { value: 'percentage' },
    })

    // title 入力（submit 可能にするため）
    fireEvent.change(screen.getByLabelText('タイトル *'), {
      target: { value: 'テスト KPI' },
    })

    // target_value に 101 を入力
    fireEvent.change(screen.getByLabelText('目標値'), {
      target: { value: '101' },
    })

    // フォーム送信
    const form = screen.getByRole('dialog').querySelector('form')!
    fireEvent.submit(form)

    // エラーメッセージ表示確認（状態更新後）
    await waitFor(() => {
      expect(
        screen.getByText('目標値は 0〜100 の範囲で入力してください')
      ).toBeInTheDocument()
    })
  })

  // title 未入力のとき追加ボタンが disabled
  test('title が空のとき追加ボタンが disabled', () => {
    render(<KpiCreateForm {...baseProps} />)
    expect(screen.getByText('追加')).toBeDisabled()
  })

  // 正常送信
  test('正しく入力して送信すると onSuccess が呼ばれる', async () => {
    vi.spyOn(api, 'createKpi').mockResolvedValue({
      success: true,
      data: {
        id: 'kpi-1', user_id: 'u', goal_id: 'goal-1', title: 'テスト KPI',
        metric_type: 'numeric', tracking_frequency: 'daily',
        display_order: 0, is_active: true, created_at: '', updated_at: '',
      },
    })
    render(<KpiCreateForm {...baseProps} />)
    fireEvent.change(screen.getByLabelText('タイトル *'), {
      target: { value: 'テスト KPI' },
    })
    const form = screen.getByRole('dialog').querySelector('form')!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(baseProps.onSuccess).toHaveBeenCalledTimes(1)
    })
  })
})
