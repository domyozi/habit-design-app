/**
 * Login.tsx テスト
 * TASK-0013: 認証画面・オンボーディング遷移実装
 *
 * テストケース:
 * 1. Googleログインボタンのクリック
 * 2. Appleログインボタンのクリック
 * 3. Wanna Be未設定時のオンボーディング遷移
 * 4. Wanna Be設定済み時のダッシュボード遷移
 * 5. ローディング中のボタン非活性化
 * 6. ログインエラーのメッセージ表示
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Login } from '@/pages/Login'
import { useAuthStore } from '@/store/authStore'
import * as api from '@/lib/api'

vi.mock('@/store/authStore')
vi.mock('@/lib/api')

const mockSignIn = vi.fn()
const mockUseAuthStore = vi.mocked(useAuthStore)
const mockApiGet = vi.mocked(api.apiGet)

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<div>ダッシュボード</div>} />
        <Route path="/onboarding" element={<div>オンボーディング</div>} />
      </Routes>
    </MemoryRouter>
  )

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthStore.mockReturnValue({
      signIn: mockSignIn,
      isLoading: false,
      isAuthenticated: false,
    } as never)
  })

  /**
   * テストケース1: Googleログインボタンのクリック
   * Given: ログイン画面が表示されている
   * When: 「Googleでログイン」ボタンをクリックする
   * Then: signIn("google") が呼び出されること
   */
  it('Googleログインボタンクリック時、signIn("google") が呼ばれる', async () => {
    mockSignIn.mockResolvedValue(undefined)
    renderLogin()

    fireEvent.click(screen.getByTestId('google-sign-in'))

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('google')
    })
  })

  /**
   * テストケース2: Appleログインボタンのクリック
   * Given: ログイン画面が表示されている
   * When: 「Appleでログイン」ボタンをクリックする
   * Then: signIn("apple") が呼び出されること
   */
  it('Appleログインボタンクリック時、signIn("apple") が呼ばれる', async () => {
    mockSignIn.mockResolvedValue(undefined)
    renderLogin()

    fireEvent.click(screen.getByTestId('apple-sign-in'))

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('apple')
    })
  })

  /**
   * テストケース3: Wanna Be未設定時のオンボーディング遷移
   * Given: ログイン成功後、GET /wanna-be が404を返す
   * When: 認証状態変化イベントが発火する
   * Then: /onboarding へ遷移すること
   */
  it('認証後 GET /wanna-be が 404 の場合、/onboarding に遷移する', async () => {
    mockApiGet.mockRejectedValue({ response: { status: 404 } })
    mockUseAuthStore.mockReturnValue({
      signIn: mockSignIn,
      isLoading: false,
      isAuthenticated: true,
    } as never)

    renderLogin()

    await waitFor(() => {
      expect(screen.getByText('オンボーディング')).toBeInTheDocument()
    })
  })

  /**
   * テストケース4: Wanna Be設定済み時のダッシュボード遷移
   * Given: ログイン成功後、GET /wanna-be がデータを返す
   * When: 認証状態変化イベントが発火する
   * Then: / へ遷移すること
   */
  it('認証後 GET /wanna-be がデータを返す場合、/ に遷移する', async () => {
    mockApiGet.mockResolvedValue({ text: 'test wanna-be' })
    mockUseAuthStore.mockReturnValue({
      signIn: mockSignIn,
      isLoading: false,
      isAuthenticated: true,
    } as never)

    renderLogin()

    await waitFor(() => {
      expect(screen.getByText('ダッシュボード')).toBeInTheDocument()
    })
  })

  /**
   * テストケース5: ローディング中のボタン非活性化
   * Given: OAuth処理中（isLoading: true）
   * When: ログイン画面を表示する
   * Then: ログインボタンが disabled 状態になり、スピナーが表示されること
   */
  it('isLoading が true のとき、ログインボタンが disabled でスピナーが表示される', () => {
    mockUseAuthStore.mockReturnValue({
      signIn: mockSignIn,
      isLoading: true,
      isAuthenticated: false,
    } as never)

    renderLogin()

    const googleBtn = screen.getByTestId('google-sign-in')
    expect(googleBtn).toBeDisabled()
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })

  /**
   * テストケース6: ログインエラーのメッセージ表示
   * Given: OAuthまたはAPI呼び出しがエラーを返す
   * When: ログイン処理が失敗する
   * Then: 「ログインに失敗しました」エラーメッセージが表示されること
   */
  it('signIn がエラーをスローした場合、エラーメッセージが表示される', async () => {
    mockSignIn.mockRejectedValue(new Error('Auth failed'))
    renderLogin()

    fireEvent.click(screen.getByTestId('google-sign-in'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/ログインに失敗しました/)).toBeInTheDocument()
    })
  })
})
