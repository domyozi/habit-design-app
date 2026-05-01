/**
 * FailureReasonInput.tsx テスト
 * TASK-0016: 未達成理由入力・3行日報フォーム実装
 *
 * テストケース:
 * 1. 「任意」ラベルが表示される
 * 2. 送信ボタンクリックで POST /habits/{id}/failure-reason が呼ばれる
 * 3. 送信中は送信ボタンが disabled になる
 * 4. スキップボタンクリックで onClose が呼ばれる
 * 5. API失敗時にエラーメッセージが表示される
 *
 * 🔵 信頼性レベル: REQ-406・user-stories 2.3 より
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import * as api from '@/lib/api'
import { FailureReasonInput } from '@/components/habits/FailureReasonInput'

vi.mock('@/lib/api')
const mockApiPost = vi.mocked(api.apiPost)

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('FailureReasonInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * テストケース1: 「任意」ラベルが表示される
   * Given: FailureReasonInput をレンダリングする
   * When: 画面を確認する
   * Then: 「任意」ラベルが表示される
   * 🔵 REQ-406 より
   */
  it('「任意」ラベルが表示される', () => {
    render(
      <FailureReasonInput habitId="h1" logDate="2026-04-14" onClose={vi.fn()} />,
      { wrapper: createWrapper() }
    )
    expect(screen.getByText('任意')).toBeInTheDocument()
  })

  /**
   * テストケース2: 送信で POST /api/habits/{id}/failure-reason が呼ばれる
   * Given: 未達成状態の習慣と入力済みの理由
   * When: 「送信」ボタンをクリックする
   * Then: POST /api/habits/h1/failure-reason が正しいパラメータで呼ばれる
   * 🔵 REQ-406 より
   */
  it('送信ボタンクリックで POST /api/habits/{id}/failure-reason が呼ばれる', async () => {
    mockApiPost.mockResolvedValue({ success: true })
    const onClose = vi.fn()

    render(
      <FailureReasonInput habitId="h1" logDate="2026-04-14" onClose={onClose} />,
      { wrapper: createWrapper() }
    )

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '残業で時間がなかった' } })
    fireEvent.click(screen.getByRole('button', { name: /送信/ }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/habits/h1/failure-reason', {
        log_date: '2026-04-14',
        reason: '残業で時間がなかった',
      })
    })
  })

  /**
   * テストケース3: 送信中は送信ボタンが disabled になる
   * Given: 送信処理が進行中
   * When: 送信ボタンを確認する
   * Then: 送信ボタンが disabled になる
   * 🔵 UI/UX要件より
   */
  it('送信中は送信ボタンが disabled になる', async () => {
    mockApiPost.mockImplementation(() => new Promise(() => {}))

    render(
      <FailureReasonInput habitId="h1" logDate="2026-04-14" onClose={vi.fn()} />,
      { wrapper: createWrapper() }
    )

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '理由' } })
    fireEvent.click(screen.getByRole('button', { name: /送信/ }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /送信/ })).toBeDisabled()
    })
  })

  /**
   * テストケース4: スキップボタンクリックで onClose が呼ばれる
   * Given: FailureReasonInput がレンダリングされている
   * When: 「スキップ」ボタンをクリックする
   * Then: onClose が呼ばれる
   * 🔵 REQ-406 より
   */
  it('スキップボタンクリックで onClose が呼ばれる', () => {
    const onClose = vi.fn()
    render(
      <FailureReasonInput habitId="h1" logDate="2026-04-14" onClose={onClose} />,
      { wrapper: createWrapper() }
    )

    fireEvent.click(screen.getByRole('button', { name: /スキップ/ }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  /**
   * テストケース5: API失敗時にエラーメッセージが表示される
   * Given: APIがエラーを返す
   * When: 送信ボタンをクリックする
   * Then: エラーメッセージが表示される
   * 🔵 UI/UX要件より
   */
  it('API失敗時にエラーメッセージが表示される', async () => {
    mockApiPost.mockRejectedValue(new Error('Network error'))

    render(
      <FailureReasonInput habitId="h1" logDate="2026-04-14" onClose={vi.fn()} />,
      { wrapper: createWrapper() }
    )

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '理由' } })
    fireEvent.click(screen.getByRole('button', { name: /送信/ }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})
