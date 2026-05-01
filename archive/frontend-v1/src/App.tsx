/**
 * アプリケーションルートコンポーネント
 * TASK-0012: フロントエンド共通基盤
 *
 * 【設計方針】:
 * - React Router v6 でルーティング管理
 * - PrivateRoute で未認証ユーザーを /login にリダイレクト
 * - initialize() でページリロード後もセッションを維持
 *
 * 🔵 信頼性レベル: TASK-0012.md・architecture.md より
 */
import { useEffect, useState, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Login } from '@/pages/Login'
import { PrivateRoute } from '@/components/PrivateRoute'
import { AuthenticatedLayout } from '@/components/layout/AuthenticatedLayout'
import { Spinner } from '@/components/ui/Spinner'
import { supabase } from '@/lib/supabase'

// 【遅延ロード】: 各画面は後続タスクで本実装予定のプレースホルダー
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Onboarding = lazy(() => import('@/pages/Onboarding'))
const WannaBe = lazy(() => import('@/pages/WannaBe'))
const WeeklyReview = lazy(() => import('@/pages/WeeklyReview'))
const Settings = lazy(() => import('@/pages/Settings'))

/**
 * 【認証コールバック処理】: Supabase OAuth リダイレクト後の処理
 * 🔵 信頼性レベル: note.md「認証コールバックURL」より
 */
export const AuthCallback = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const setSession = useAuthStore((state) => state.setSession)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    const completeOAuth = async () => {
      try {
        const code = new URLSearchParams(location.search).get('code')

        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
          if (!cancelled) setSession(data.session ?? null)
        }

        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()

        if (error) throw error
        if (!session) throw new Error('No session after OAuth callback')

        if (!cancelled) {
          setSession(session)
          navigate('/', { replace: true })
        }
      } catch (error) {
        console.error('OAuth callback failed', error)
        if (!cancelled) {
          setErrorMessage('認証の完了に失敗しました。もう一度お試しください。')
        }
      }
    }

    completeOAuth()

    return () => {
      cancelled = true
    }
  }, [location.search, navigate, setSession])

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <div className="rounded-[28px] border border-white/10 bg-white/5 px-8 py-6 text-center text-white shadow-[0_20px_80px_rgba(15,23,42,0.35)] backdrop-blur">
        <Spinner size="lg" className="mx-auto" />
        <p className="mt-4 text-sm font-medium text-white/80">認証処理中...</p>
        {errorMessage ? (
          <div className="mt-4 rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** 【ページローディングフォールバック】 */
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <Spinner size="lg" />
  </div>
)

/**
 * 【アプリルート】: 認証状態初期化とルーティング定義
 * 🔵 信頼性レベル: TASK-0012.md・architecture.md より
 */
export const App = () => {
  const initialize = useAuthStore((state) => state.initialize)

  useEffect(() => {
    const cleanup = initialize()
    return cleanup
  }, [initialize])

  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* 【公開ルート】: 認証不要でアクセス可能 */}
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* 【認証必須ルート】: PrivateRoute でガード */}
          <Route
            path="/onboarding"
            element={
              <PrivateRoute>
                <Onboarding />
              </PrivateRoute>
            }
          />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <AuthenticatedLayout>
                  <Dashboard />
                </AuthenticatedLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/wanna-be"
            element={
              <PrivateRoute>
                <AuthenticatedLayout>
                  <WannaBe />
                </AuthenticatedLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/weekly-review"
            element={
              <PrivateRoute>
                <AuthenticatedLayout>
                  <WeeklyReview />
                </AuthenticatedLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <PrivateRoute>
                <AuthenticatedLayout>
                  <Settings />
                </AuthenticatedLayout>
              </PrivateRoute>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
