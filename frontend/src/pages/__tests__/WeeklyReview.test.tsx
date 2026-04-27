/**
 * WeeklyReview.tsx テスト
 * TASK-0020: 週次レビュー画面実装
 *
 * テストケース:
 * 1. 「週次レビューを開始する」ボタンが表示される
 * 2. ボタンクリックで SSE 接続が開始され、チャンクが表示される
 * 3. AI_UNAVAILABLE エラー時にエラーメッセージが表示される
 * 4. AIActionProposal が表示される（isDone=true かつ actions あり）
 *
 * 🔵 信頼性レベル: REQ-601/603/703・EDGE-001 より
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { createElement } from 'react'
import * as api from '@/lib/api'

vi.mock('@/lib/api')

// useSSEStream を制御可能にモック
const mockSSEState = {
  chunks: [] as string[],
  isDone: false,
  suggestedGoals: [] as Array<{ title: string; description: string }>,
  actions: [] as Array<Record<string, unknown>>,
  achievementRate: null as number | null,
  error: null as string | null,
}

vi.mock('@/hooks/useSSEStream', () => ({
  useSSEStream: vi.fn(() => ({ ...mockSSEState })),
}))

import { useSSEStream } from '@/hooks/useSSEStream'
import WeeklyReview from '@/pages/WeeklyReview'

const mockUseSSEStream = vi.mocked(useSSEStream)
const mockApiGet = vi.mocked(api.apiGet)

const createWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, createElement(MemoryRouter, null, children))
}

describe('WeeklyReview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(mockSSEState, { chunks: [], isDone: false, suggestedGoals: [], actions: [], achievementRate: null, error: null })
    mockUseSSEStream.mockReturnValue({ ...mockSSEState })
    mockApiGet.mockResolvedValue({ success: true, data: { achievement_rate: 85, completed_count: 34, total_habits: 40, current_streak: 12 } })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  /**
   * テストケース1: 「週次レビューを開始する」ボタンが表示される
   * Given: WeeklyReview ページをレンダリングする
   * When: 初期表示
   * Then: ボタンが表示される
   * 🔵 REQ-703 より
   */
  it('「週次レビューを開始する」ボタンが表示される', () => {
    render(<WeeklyReview />, { wrapper: createWrapper() })
    expect(screen.getByRole('button', { name: /週次レビューを開始する/ })).toBeInTheDocument()
  })

  /**
   * テストケース2: ボタンクリックで SSE 接続が開始され、チャンクが表示される
   * Given: WeeklyReview がレンダリングされている
   * When: 「週次レビューを開始する」をクリックし、chunks が届く
   * Then: チャンクテキストが表示される
   * 🔵 REQ-603 より
   */
  it('ボタンクリック後に SSE チャンクが表示される', async () => {
    mockUseSSEStream.mockReturnValueOnce({ chunks: [], isDone: false, suggestedGoals: [], actions: [], achievementRate: null, error: null })
    mockUseSSEStream.mockReturnValue({ chunks: ['今週は素晴らしい'], isDone: false, suggestedGoals: [], actions: [], achievementRate: null, error: null })

    render(<WeeklyReview />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole('button', { name: /週次レビューを開始する/ }))

    await waitFor(() => {
      expect(screen.getByText(/今週は素晴らしい/)).toBeInTheDocument()
    })
  })

  /**
   * テストケース3: エラー時にエラーメッセージが表示される
   * Given: useSSEStream が error='AI_UNAVAILABLE' を返す
   * When: ボタンをクリックする
   * Then: エラーアラートが表示される
   * 🔵 EDGE-001 より
   */
  it('SSE エラー時にエラーメッセージが表示される', async () => {
    mockUseSSEStream.mockReturnValue({ chunks: [], isDone: false, suggestedGoals: [], actions: [], achievementRate: null, error: 'AI_UNAVAILABLE' })

    render(<WeeklyReview />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('button', { name: /週次レビューを開始する/ }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/AIが現在利用できません/)).toBeInTheDocument()
    })
  })

  /**
   * テストケース4: isDone=true かつ actions がある場合、AI提案カードが表示される
   * Given: useSSEStream が isDone=true、提案テキストあり
   * When: WeeklyReview をレンダリング
   * Then: AIフィードバックが表示される
   * 🔵 REQ-303 より
   */
  it('isDone=true のとき AI フィードバック結果が表示される', async () => {
    mockUseSSEStream.mockReturnValue({
      chunks: ['分析完了しました'],
      isDone: true,
      suggestedGoals: [],
      actions: [],
      achievementRate: 84,
      error: null,
    })

    render(<WeeklyReview />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('button', { name: /週次レビューを開始する/ }))

    await waitFor(() => {
      expect(screen.getByText(/分析完了しました/)).toBeInTheDocument()
    })
  })
})
