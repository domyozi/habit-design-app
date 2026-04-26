import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { KgiSetupForm } from './KgiSetupForm'
import * as api from '../lib/api'

describe('KgiSetupForm', () => {
  const baseProps = {
    goalId: 'goal-1',
    goalTitle: 'テスト目標',
    onSuccess: vi.fn(),
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // TC2: target_date 未入力時に保存ボタンが disabled
  test('target_date が空のとき保存ボタンが disabled', () => {
    render(<KgiSetupForm {...baseProps} />)
    const submitButton = screen.getByText('保存')
    expect(submitButton).toBeDisabled()
  })

  // target_date 入力後は保存ボタンが有効
  test('target_date を入力すると保存ボタンが有効になる', () => {
    render(<KgiSetupForm {...baseProps} />)
    fireEvent.change(screen.getByLabelText('目標日 *'), {
      target: { value: '2026-12-31' },
    })
    expect(screen.getByText('保存')).not.toBeDisabled()
  })

  // TC4: KGI化成功後 onSuccess が呼ばれる
  test('フォームに正しく入力して送信すると onSuccess が呼ばれる', async () => {
    vi.spyOn(api, 'patchGoalKgi').mockResolvedValue({
      success: true,
      data: { id: 'goal-1', user_id: 'u', title: 'テスト', display_order: 0, is_active: true, is_kgi: true, created_at: '', updated_at: '' },
    })
    render(<KgiSetupForm {...baseProps} />)
    fireEvent.change(screen.getByLabelText('目標日 *'), {
      target: { value: '2026-12-31' },
    })
    const form = screen.getByRole('dialog').querySelector('form')!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(baseProps.onSuccess).toHaveBeenCalledTimes(1)
    })
  })
})
