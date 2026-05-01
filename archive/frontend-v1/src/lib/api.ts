/**
 * APIクライアント
 * TASK-0012: フロントエンド共通基盤
 *
 * 【設計方針】:
 * - axios インスタンスで baseURL・インターセプターを集約管理
 * - リクエストインターセプター: Supabase JWT を Authorization ヘッダーに付与
 * - レスポンスインターセプター: 401 時に自動サインアウト
 *
 * 🔵 信頼性レベル: architecture.md・REQ-103 より
 */
import axios from 'axios'
import { supabase } from '@/lib/supabase'

const getApiBaseUrl = () => import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

/**
 * baseURL に `/api` が含まれていても、呼び出し側が `/api/...` を渡しても
 * 最終的なリクエスト先が二重の `/api/api/...` にならないよう正規化する。
 */
const normalizeApiUrl = (url: string) => {
  const normalizedBase = (apiClient.defaults.baseURL ?? '').replace(/\/+$/, '')
  const normalizedUrl = url.startsWith('/') ? url : `/${url}`

  if (normalizedBase.endsWith('/api') && normalizedUrl.startsWith('/api/')) {
    return normalizedUrl.slice(4)
  }

  return normalizedUrl
}

/** 【axiosインスタンス】: VITE_API_URL をベースURLとするシングルトン */
const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
})

/**
 * 【リクエストインターセプター】: Supabase セッションから JWT を取得してヘッダーに付与
 * セッションが存在しない場合はヘッダーを付与しない
 * 🔵 REQ-103: 全認証済みリクエストに JWT を付与
 */
apiClient.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
})

/**
 * 【レスポンスインターセプター】: 401 レスポンス時にサインアウトを実行
 * 🔵 NFR-101: トークン期限切れ時の自動ログアウト
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await supabase.auth.signOut()
    }
    return Promise.reject(error)
  }
)

/** GET リクエスト */
export const apiGet = <T>(url: string, params?: Record<string, unknown>) =>
  apiClient.get<T>(normalizeApiUrl(url), { params }).then((r) => r.data)

/** POST リクエスト */
export const apiPost = <T>(url: string, data?: unknown) =>
  apiClient.post<T>(normalizeApiUrl(url), data).then((r) => r.data)

/** PATCH リクエスト */
export const apiPatch = <T>(url: string, data?: unknown) =>
  apiClient.patch<T>(normalizeApiUrl(url), data).then((r) => r.data)

/** DELETE リクエスト */
export const apiDelete = <T>(url: string) =>
  apiClient.delete<T>(normalizeApiUrl(url)).then((r) => r.data)

/**
 * 【SSEストリーミング生成】: Claude AI 分析・週次レビュー等に使用
 * 🔵 REQ-203: WannaBe分析のSSEストリーミング
 */
export const createSSEStream = (url: string, token: string): EventSource =>
  new EventSource(`${url}?token=${token}`)

export default apiClient
