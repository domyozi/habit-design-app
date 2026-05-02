import { useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { getTheme } from '@/lib/theme'

interface Props {
  children: ReactNode
}

export function AuthGate({ children }: Props) {
  const auth = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = getTheme(new Date().getHours())

  const isCallback =
    typeof window !== 'undefined' && window.location.pathname === '/auth/callback'

  if (auth.status === 'loading' || isCallback) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: t.paper,
          color: t.ink50,
          fontFamily: t.mono,
          fontSize: 11,
          letterSpacing: '0.18em',
        }}
      >
        SIGNING IN…
      </div>
    )
  }

  if (auth.status === 'authenticated') {
    return <>{children}</>
  }

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (err) {
      setError(err.message)
      setLoading(false)
    }
    // onAuthStateChange will handle the success path after redirect.
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: t.paper,
        backgroundImage: `radial-gradient(ellipse 100% 60% at 50% 0%, ${t.accent}10, transparent 60%), linear-gradient(180deg, ${t.paper} 0%, ${t.paperWarm} 100%)`,
        fontFamily: t.sans,
      }}
    >
      <div
        style={{
          width: 380,
          padding: 28,
          background: t.paper,
          border: `1px solid ${t.line}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: t.mono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: t.ink50,
            }}
          >
            DAILY.OS · SIGN IN
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.015em',
              marginTop: 4,
              color: t.ink,
            }}
          >
            ようこそ
          </div>
          <div
            style={{
              fontSize: 12,
              color: t.ink70,
              marginTop: 8,
              lineHeight: 1.55,
            }}
          >
            理想の姿から逆算した習慣設計を始めましょう。
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '8px 10px',
              background: `${t.accent}14`,
              border: `1px solid ${t.accent}`,
              fontSize: 12,
              color: t.accent,
              fontFamily: t.mono,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={() => handleOAuth('google')}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '12px 16px',
            background: t.paper,
            color: t.ink,
            border: `1px solid ${t.line}`,
            fontFamily: t.sans,
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {loading ? '接続中…' : 'Google で始める'}
        </button>

        <button
          type="button"
          onClick={() => handleOAuth('apple')}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '12px 16px',
            background: t.paper,
            color: t.ink,
            border: `1px solid ${t.line}`,
            fontFamily: t.sans,
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
          </svg>
          {loading ? '接続中…' : 'Apple で始める'}
        </button>

        <div
          style={{
            fontFamily: t.mono,
            fontSize: 10,
            color: t.ink50,
            letterSpacing: '0.06em',
            textAlign: 'center',
            marginTop: 4,
          }}
        >
          frontend-v2 と同じ Supabase を共有しています
        </div>

        {/* Hidden helper: sign out current cached session to force re-login */}
        <button
          type="button"
          onClick={handleSignOut}
          style={{
            background: 'transparent',
            border: 'none',
            fontFamily: t.mono,
            fontSize: 9,
            color: t.ink30,
            letterSpacing: '0.14em',
            cursor: 'pointer',
            padding: 0,
            textAlign: 'center',
          }}
        >
          (sign out cached session)
        </button>
      </div>
    </div>
  )
}
