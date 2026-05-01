/**
 * Settings.tsx テスト
 * TASK-0023: 設定・通知設定画面実装
 *
 * テストケース:
 * 1. 通知設定の保存（PATCH /users/me）
 * 2. 週次レビュー曜日の変更
 * 3. ログアウトボタンで signOut が呼ばれる
 * 4. ローディング中は保存ボタンが disabled になる
 * 5. 保存失敗時にエラーメッセージが表示される
 * 6. プロフィール情報が初期値として表示される
 *
 * 🔵 信頼性レベル: REQ-701/801/802 より
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// モック定義
vi.mock('@/lib/api')
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}))
vi.mock('@/store/authStore', () => ({
  useAuthStore: () => ({
    signOut: mockSignOut,
    user: { email: 'test@example.com' },
    isAuthenticated: true,
  }),
}))
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  }
})

import { useQuery, useMutation } from '@tanstack/react-query'
import * as api from '@/lib/api'
import Settings from '@/pages/Settings'

const mockSignOut = vi.fn()
const mockUseQuery = vi.mocked(useQuery)
const mockUseMutation = vi.mocked(useMutation)
const mockApiPatch = vi.mocked(api.apiPatch)

const mockProfile = {
  id: 'user-1',
  display_name: '田中 太郎',
  timezone: 'Asia/Tokyo',
  weekly_review_day: 5,
  notification_email: 'test@example.com',
  notification_enabled: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
}

const renderSettings = () =>
  render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  )

describe('Settings', () => {
  let mockMutate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockMutate = vi.fn()
    mockUseQuery.mockReturnValue({
      data: mockProfile,
      isPending: false,
      isError: false,
      error: null,
    } as never)
    mockUseMutation.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isError: false,
      error: null,
    } as never)
    mockApiPatch.mockResolvedValue({ success: true, data: mockProfile })
  })

  /**
   * テストケース1: 通知設定の保存
   * Given: 通知設定フォームに入力した状態
   * When: 「保存」ボタンをクリックする
   * Then: mutate が呼ばれる
   * 🔵 REQ-801/802 より
   */
  it('保存ボタンをクリックすると mutate が呼ばれる', async () => {
    renderSettings()

    // 通知メールを変更
    const emailInput = screen.getByTestId('notification-email-input')
    fireEvent.change(emailInput, { target: { value: 'new@example.com' } })

    fireEvent.click(screen.getByTestId('save-button'))

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalled()
    })
  })

  /**
   * テストケース2: 週次レビュー曜日の変更
   * Given: 設定画面が表示された状態
   * When: 週次レビュー曜日セレクトを変更する
   * Then: 選択値が変更される
   * 🔵 REQ-701 より
   */
  it('週次レビュー曜日セレクトが変更できる', async () => {
    renderSettings()

    const select = screen.getByTestId('weekly-review-day-select')
    fireEvent.change(select, { target: { value: '1' } })

    expect((select as HTMLSelectElement).value).toBe('1')
  })

  /**
   * テストケース3: ログアウトボタンで signOut が呼ばれる
   * Given: 設定画面が表示された状態
   * When: ログアウトボタンをクリックする
   * Then: signOut が呼ばれる
   */
  it('ログアウトボタンで signOut が呼ばれる', async () => {
    renderSettings()

    fireEvent.click(screen.getByTestId('logout-button'))

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1)
    })
  })

  /**
   * テストケース4: ローディング中は保存ボタンが disabled
   * Given: mutate 実行中（isPending=true）
   * When: Settings をレンダリングする
   * Then: 保存ボタンが disabled になる
   * 🔵 UX要件より
   */
  it('保存中は保存ボタンが disabled になる', () => {
    mockUseMutation.mockReturnValue({
      mutate: mockMutate,
      isPending: true,
      isError: false,
      error: null,
    } as never)

    renderSettings()

    expect(screen.getByTestId('save-button')).toBeDisabled()
  })

  /**
   * テストケース5: 保存失敗時にエラーメッセージが表示される
   * Given: mutate がエラー状態
   * When: Settings をレンダリングする
   * Then: エラーメッセージが表示される
   * 🔵 EDGE-001 より
   */
  it('保存失敗時にエラーメッセージが表示される', () => {
    mockUseMutation.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isError: true,
      error: new Error('保存に失敗しました'),
    } as never)

    renderSettings()

    expect(screen.getByTestId('save-error')).toBeInTheDocument()
  })

  /**
   * テストケース6: プロフィール情報が初期値として表示される
   * Given: プロフィールデータ（display_name="田中 太郎"）
   * When: Settings をレンダリングする
   * Then: 「田中 太郎」が表示される
   * 🔵 REQ-103 より
   */
  it('プロフィール情報が初期値として表示される', async () => {
    renderSettings()

    await waitFor(() => {
      expect(screen.getByTestId('display-name')).toHaveTextContent('田中 太郎')
    })
  })
})
