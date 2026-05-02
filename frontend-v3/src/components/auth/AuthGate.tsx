import { useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { getTheme } from '@/lib/theme'

interface Props {
  children: ReactNode
}

export function AuthGate({ children }: Props) {
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const t = getTheme(new Date().getHours())

  if (auth.status === 'loading') {
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
        LOADING SESSION…
      </div>
    )
  }

  if (auth.status === 'authenticated') {
    return <>{children}</>
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err) setError(err.message)
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
      <form
        onSubmit={onSubmit}
        style={{
          width: 360,
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
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{
              fontFamily: t.mono,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: t.ink50,
            }}
          >
            EMAIL
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            style={{
              padding: '10px 12px',
              border: `1px solid ${t.line}`,
              fontFamily: t.sans,
              fontSize: 14,
              background: t.paper,
              color: t.ink,
              outline: 'none',
            }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{
              fontFamily: t.mono,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: t.ink50,
            }}
          >
            PASSWORD
          </span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{
              padding: '10px 12px',
              border: `1px solid ${t.line}`,
              fontFamily: t.sans,
              fontSize: 14,
              background: t.paper,
              color: t.ink,
              outline: 'none',
            }}
          />
        </label>

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
          type="submit"
          disabled={loading || !email || !password}
          style={{
            padding: '12px 16px',
            background: t.ink,
            color: t.paper,
            border: `1px solid ${t.line}`,
            fontFamily: t.mono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.18em',
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'SIGNING IN…' : 'SIGN IN →'}
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
      </form>
    </div>
  )
}
