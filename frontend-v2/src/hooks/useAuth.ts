import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface UseAuthReturn {
  session: Session | null
  loading: boolean
  signIn: (provider: 'google' | 'apple') => Promise<void>
  signOut: () => Promise<void>
}

export const useAuth = (): UseAuthReturn => {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    // 新しい Supabase SDK は PKCE コード交換を自動で行う
    // onAuthStateChange が SIGNED_IN を発火させるので、そこでセッションを受け取る
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
      // コールバックURL にいたらルートへ戻す
      if (data.session && window.location.pathname === '/auth/callback') {
        window.history.replaceState({}, '', '/')
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setSession(session)
      setLoading(false)
      // Google / Apple 認証完了後にコールバックURLからルートへリダイレクト
      if (session && window.location.pathname === '/auth/callback') {
        window.history.replaceState({}, '', '/')
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (provider: 'google' | 'apple') => {
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setSession(null)
  }

  return { session, loading, signIn, signOut }
}
