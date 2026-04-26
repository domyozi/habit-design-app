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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setSession(session)
      setLoading(false)
      if (session && window.location.pathname === '/auth/callback') {
        window.history.replaceState({}, '', '/')
      }
    })

    // コールバックページ（hash に access_token あり）は onAuthStateChange に任せる
    // それ以外は getSession で初期セッションを取得
    const isCallback = window.location.pathname === '/auth/callback' &&
      window.location.hash.includes('access_token')

    if (!isCallback) {
      supabase.auth.getSession().then(({ data }) => {
        if (!mounted) return
        setSession(data.session)
        setLoading(false)
      })
    }

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
