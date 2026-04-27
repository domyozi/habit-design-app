/**
 * DailyReportForm.tsx テスト
 * TASK-0016: 未達成理由入力・3行日報フォーム実装
 *
 * テストケース:
 * 1. 習慣達成状況サマリーが表示される
 * 2. 保存ボタンクリックで POST /api/journal-entries が呼ばれる
 * 3. 保存中は保存ボタンが disabled になる
 *
 * 🔵 信頼性レベル: REQ-405 より
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import * as api from '@/lib/api'
import { DailyReportForm } from '@/components/dashboard/DailyReportForm'

vi.mock('@/lib/api')
const mockApiPost = vi.mocked(api.apiPost)

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('DailyReportForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * テストケース1: 習慣達成状況サマリーが表示される
   * Given: achievementSummary="3/5達成" で DailyReportForm をレンダリングする
   * When: 画面を確認する
   * Then: 「3/5達成」が表示される
   * 🔵 REQ-405 より
   */
  it('習慣達成状況サマリーが表示される', () => {
    render(
      <DailyReportForm achievementSummary="3/5達成" />,
      { wrapper: createWrapper() }
    )
    expect(screen.getByText('3/5達成')).toBeInTheDocument()
  })

  /**
   * テストケース2: 保存ボタンクリックで POST /api/journal-entries が daily_report タイプで呼ばれる
   * Given: 各フィールドに入力済み
   * When: 「保存」ボタンをクリックする
   * Then: POST /api/journal-entries が entry_type: 'daily_report' で呼ばれる
   * 🔵 REQ-405 より
   */
  it('保存ボタンクリックで POST /api/journal-entries が daily_report タイプで呼ばれる', async () => {
    mockApiPost.mockResolvedValue({ success: true })

    render(
      <DailyReportForm achievementSummary="3/5達成" />,
      { wrapper: createWrapper() }
    )

    fireEvent.change(
      screen.getByPlaceholderText('今日の主な行動を1行で'),
      { target: { value: '英語30分勉強した' } }
    )
    fireEvent.change(
      screen.getByPlaceholderText('明日最も重要なタスクは？'),
      { target: { value: 'プレゼン資料作成' } }
    )
    fireEvent.click(screen.getByRole('button', { name: /保存/ }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/api/journal-entries',
        expect.objectContaining({ entry_type: 'daily_report' })
      )
    })
  })

  /**
   * テストケース3: 保存中は保存ボタンが disabled になる
   * Given: 保存処理が進行中
   * When: 保存ボタンを確認する
   * Then: 保存ボタンが disabled になる
   * 🔵 UI/UX要件より
   */
  it('保存中は保存ボタンが disabled になる', async () => {
    mockApiPost.mockImplementation(() => new Promise(() => {}))

    render(
      <DailyReportForm achievementSummary="3/5達成" />,
      { wrapper: createWrapper() }
    )

    fireEvent.change(
      screen.getByPlaceholderText('今日の主な行動を1行で'),
      { target: { value: '英語' } }
    )
    fireEvent.click(screen.getByRole('button', { name: /保存/ }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /保存/ })).toBeDisabled()
    })
  })
})
