/**
 * 認証状態管理ストア
 * TASK-0012: フロントエンド共通基盤（TASK-0004 から拡張）
 *
 * 【設計方針】:
 * - Zustand で session/user/profile/isLoading/isAuthenticated を管理
 * - onAuthStateChange でセッション変更を監視（ページリロード後も維持）
 * - isAuthenticated: session が存在するかどうかで判定
 * - setSession: セッション設定アクション
 *
 * 🔵 信頼性レベル: TASK-0004・REQ-103 より
 */
import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { UserProfile } from '@/types/interfaces'

type CleanupFn = () => void

interface AuthState {
  /** 現在のセッション（null = 未認証） */
  session: Session | null
  /** 現在のユーザー情報（null = 未認証） */
  user: User | null
  /** DBのusersテーブルのプロフィール情報 */
  profile: UserProfile | null
  /** 認証状態確認中フラグ */
  isLoading: boolean
  /** 認証済みフラグ（session が存在するかどうか） */
  isAuthenticated: boolean
  /** セッション設定アクション */
  setSession: (session: Session | null) => void
  /** Google / Apple OAuth ログイン */
  signIn: (provider?: 'google' | 'apple') => Promise<void>
  /** ログアウト */
  signOut: () => Promise<void>
  /** セッション初期化・変更監視 */
  initialize: () => CleanupFn
}

/**
 * 【認証ストア】: アプリ全体で認証状態を共有するZustandストア
 * 【セッション永続化】: Supabase JS SDK がlocalStorageに自動保存
 * 🔵 信頼性レベル: auth-flow-requirements.md・interfaces.ts より
 */
export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  profile: null,
  isLoading: true,
  isAuthenticated: false,

  setSession: (session: Session | null) => {
    set({
      session,
      user: session?.user ?? null,
      isAuthenticated: session !== null,
    })
  },

  signIn: async (provider: 'google' | 'apple' = 'google') => {
    /**
     * 【Google / Apple OAuthログイン】: Supabase の signInWithOAuth でOAuthリダイレクト
     * 🔵 信頼性レベル: REQ-101/102・note.md フロントエンド注意事項より
     */
    set({ isLoading: true })

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      set({ isLoading: false })
      throw error
    }
  },

  signOut: async () => {
    /**
     * 【ログアウト処理】: Supabase のセッションをクリアしてストアを初期化
     * 🔵 信頼性レベル: auth-flow-requirements.md セクション2 より
     */
    set({ isLoading: true })
    await supabase.auth.signOut()
    set({ session: null, user: null, profile: null, isAuthenticated: false, isLoading: false })
  },

  initialize: () => {
    /**
     * 【セッション初期化】: ページロード時に既存セッションを復元
     * 【変更監視】: onAuthStateChange でリアルタイムにセッション変更を検知
     * 🔵 信頼性レベル: auth-flow-requirements.md より
     */
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({
        session,
        user: session?.user ?? null,
        isAuthenticated: session !== null,
        isLoading: false,
      })
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      set({
        session,
        user: session?.user ?? null,
        isAuthenticated: session !== null,
        isLoading: false,
      })
    })

    return () => {
      subscription.unsubscribe()
    }
  },
}))
