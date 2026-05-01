/**
 * WannaBe.tsx テスト
 * TASK-0017: Wanna Be設定・AI分析ストリーミング画面実装
 *
 * テストケース:
 * 1. 現在のWanna Beテキストが表示される
 * 2. 「AIに相談する」クリックで startAnalysis が呼ばれる
 * 3. ストリーミング中は「AIが考え中...」が表示される
 * 4. 目標候補が表示される（isDone=true）
 * 5. AI_UNAVAILABLE エラーメッセージが表示される
 *
 * 🔵 信頼性レベル: REQ-201/202/203・EDGE-001 より
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { createElement } from 'react'
import * as api from '@/lib/api'

vi.mock('@/lib/api')

const mockStartAnalysis = vi.fn()
const mockReset = vi.fn()

const defaultAnalysisState = {
  isStreaming: false,
  streamedText: '',
  isDone: false,
  suggestedGoals: [],
  error: null,
  startAnalysis: mockStartAnalysis,
  reset: mockReset,
}

vi.mock('@/hooks/useWannaBeAnalysis', () => ({
  useWannaBeAnalysis: vi.fn(() => defaultAnalysisState),
}))

import { useWannaBeAnalysis } from '@/hooks/useWannaBeAnalysis'
import WannaBe from '@/pages/WannaBe'

const mockUseWannaBeAnalysis = vi.mocked(useWannaBeAnalysis)
const mockApiGet = vi.mocked(api.apiGet)
const mockApiPost = vi.mocked(api.apiPost)

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, null, children)
    )
}

describe('WannaBe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseWannaBeAnalysis.mockReturnValue({ ...defaultAnalysisState })
  })

  /**
   * テストケース1: 現在のWanna Beテキストが表示される
   * Given: GET /api/wanna-be が既存テキストを返す
   * When: WannaBe ページをレンダリングする
   * Then: テキストエリアに現在のWanna Beが表示される
   * 🔵 REQ-202 より
   */
  it('現在のWanna Beテキストがテキストエリアに表示される', async () => {
    // /api/wanna-be → wanna-be データ, /api/goals → 空配列
    mockApiGet.mockImplementation((url: string) => {
      if ((url as string).includes('wanna-be')) {
        return Promise.resolve({ success: true, data: { text: '1年後の自分は毎朝6時に起きている' } })
      }
      return Promise.resolve({ success: true, data: [] })
    })

    render(<WannaBe />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByDisplayValue('1年後の自分は毎朝6時に起きている')).toBeInTheDocument()
    })
  })

  /**
   * テストケース2: 「AIに相談する」クリックで startAnalysis が呼ばれる
   * Given: テキストエリアに入力済み
   * When: 「AIに相談する」ボタンをクリックする
   * Then: startAnalysis が入力テキストで呼ばれる
   * 🔵 REQ-201 より
   */
  it('「AIに相談する」クリックで startAnalysis が入力テキストで呼ばれる', async () => {
    mockApiGet.mockResolvedValue({ success: false, data: null })

    render(<WannaBe />, { wrapper: createWrapper() })

    const textarea = screen.getByPlaceholderText(/なりたい自分/)
    fireEvent.change(textarea, { target: { value: '英語でプレゼンできる自分になる' } })
    fireEvent.click(screen.getByRole('button', { name: /AIに相談する/ }))

    expect(mockStartAnalysis).toHaveBeenCalledWith('英語でプレゼンできる自分になる')
  })

  /**
   * テストケース3: ストリーミング中は「AIが考え中...」が表示される
   * Given: isStreaming=true の状態
   * When: WannaBe ページをレンダリングする
   * Then: 「AIが考え中...」インジケーターが表示される
   * 🔵 NFR-002 より
   */
  it('ストリーミング中は「AIが考え中...」が表示される', () => {
    mockApiGet.mockResolvedValue({ success: false, data: null })
    mockUseWannaBeAnalysis.mockReturnValue({
      ...defaultAnalysisState,
      isStreaming: true,
      streamedText: 'あなたのWanna Beから',
    })

    render(<WannaBe />, { wrapper: createWrapper() })

    expect(screen.getAllByText(/AIが考え中/).length).toBeGreaterThanOrEqual(1)
  })

  /**
   * テストケース4: isDone=true のとき目標候補が表示される
   * Given: isDone=true, suggestedGoals に2件の候補
   * When: WannaBe ページをレンダリングする
   * Then: 目標候補タイトルが表示される
   * 🔵 REQ-203 より
   */
  it('isDone=true のとき目標候補が表示される', () => {
    mockApiGet.mockResolvedValue({ success: false, data: null })
    mockUseWannaBeAnalysis.mockReturnValue({
      ...defaultAnalysisState,
      isDone: true,
      suggestedGoals: [
        { title: '早起きの習慣化', description: '毎朝6時起床' },
        { title: '英語力向上', description: 'ビジネス英語習得' },
      ],
    })

    render(<WannaBe />, { wrapper: createWrapper() })

    expect(screen.getByText('早起きの習慣化')).toBeInTheDocument()
    expect(screen.getByText('英語力向上')).toBeInTheDocument()
  })

  /**
   * テストケース5: AI_UNAVAILABLE エラーメッセージが表示される
   * Given: error='AI_UNAVAILABLE'
   * When: WannaBe ページをレンダリングする
   * Then: エラーメッセージが表示される
   * 🔵 EDGE-001 より
   */
  it('AI_UNAVAILABLE エラー時にメッセージが表示される', () => {
    mockApiGet.mockResolvedValue({ success: false, data: null })
    mockUseWannaBeAnalysis.mockReturnValue({
      ...defaultAnalysisState,
      error: 'AI_UNAVAILABLE',
    })

    render(<WannaBe />, { wrapper: createWrapper() })

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/AI機能が現在利用できません/)).toBeInTheDocument()
  })

  /**
   * テストケース6: 目標候補を承認すると POST /api/goals が呼ばれる
   * Given: isDone=true で目標候補が1件
   * When: 「保存する」ボタンをクリックする
   * Then: POST /api/goals が呼ばれる
   * 🔵 REQ-203 より
   */
  it('目標候補を承認すると POST /api/goals が呼ばれる', async () => {
    mockApiGet.mockResolvedValue({
      success: true,
      data: { id: 'wb-1', text: 'テスト' },
    })
    mockApiPost.mockResolvedValue({ success: true })
    mockUseWannaBeAnalysis.mockReturnValue({
      ...defaultAnalysisState,
      isDone: true,
      suggestedGoals: [
        { title: '早起きの習慣化', description: '毎朝6時起床' },
      ],
    })

    render(<WannaBe />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('早起きの習慣化')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /保存する/ }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/api/goals',
        expect.objectContaining({ goals: expect.any(Array) })
      )
    })
  })
})
