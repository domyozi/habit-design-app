/**
 * 認証ガードコンポーネント
 * TASK-0012: フロントエンド共通基盤
 *
 * 【設計方針】:
 * - isAuthenticated が false かつ isLoading が false の場合、/login へリダイレクト
 * - isLoading 中はスピナーを全画面表示（セッション確認前にリダイレクトしない）
 *
 * 🔵 信頼性レベル: NFR-101・architecture.md より
 */
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Spinner } from '@/components/ui/Spinner'

interface PrivateRouteProps {
  children: React.ReactNode
}

/**
 * 【認証ガード】: 未認証ユーザーをログインページへリダイレクト
 * 🔵 信頼性レベル: NFR-101・TASK-0012.md より
 */
export const PrivateRoute = ({ children }: PrivateRouteProps) => {
  const { isAuthenticated, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
