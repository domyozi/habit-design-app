/**
 * PrivateRoute テスト
 * TASK-0012: フロントエンド共通基盤
 *
 * テストケース:
 * 4. PrivateRouteの未認証リダイレクト
 * 5. PrivateRouteの認証済みアクセス
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { PrivateRoute } from '@/components/PrivateRoute'
import { useAuthStore } from '@/store/authStore'

// authStore をモック
vi.mock('@/store/authStore')

const mockUseAuthStore = vi.mocked(useAuthStore)

describe('PrivateRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * テストケース4: PrivateRouteの未認証リダイレクト
   * Given: isAuthenticated が false・isLoading が false
   * When: PrivateRoute でラップされた "/" にアクセスする
   * Then: "/login" へリダイレクトされること
   */
  it('未認証かつローディング完了時、/login にリダイレクトされる', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    } as never)

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/login" element={<div>ログインページ</div>} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <div>ダッシュボード</div>
              </PrivateRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('ログインページ')).toBeInTheDocument()
    expect(screen.queryByText('ダッシュボード')).not.toBeInTheDocument()
  })

  /**
   * テストケース5: PrivateRouteの認証済みアクセス
   * Given: isAuthenticated が true
   * When: PrivateRoute でラップされた "/" にアクセスする
   * Then: ダッシュボードコンポーネントが表示されること
   */
  it('認証済みの場合、子コンポーネントが表示される', () => {
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    } as never)

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/login" element={<div>ログインページ</div>} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <div>ダッシュボード</div>
              </PrivateRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('ダッシュボード')).toBeInTheDocument()
    expect(screen.queryByText('ログインページ')).not.toBeInTheDocument()
  })
})
