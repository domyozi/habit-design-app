import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { BrandMark } from '@/components/ui/BrandMark'

export const AuthPage = () => {
  const { signIn } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async (provider: 'google' | 'apple') => {
    setError(null)
    setLoading(true)
    try {
      await signIn(provider)
    } catch {
      setError('ログインに失敗しました。もう一度お試しください。')
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#05080d] px-4">
      {/* 背景グロー */}
      <div className="pointer-events-none absolute left-[-10%] top-[-10%] h-[50vw] w-[50vw] rounded-full bg-[#7dd3fc]/6 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-20%] right-[-10%] h-[60vw] w-[60vw] rounded-full bg-[#a78bfa]/5 blur-[140px]" />

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <BrandMark subtitle="habit design system" />
        </div>

        <div
          className="w-full rounded-[28px] px-7 py-8"
          style={{
            background: 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.09)',
            boxShadow: '0 24px 64px -12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8da4c3]">
            Start Today
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
            ワークスペースへ
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/52">
            ログインすると、理想の姿から逆算した習慣設計をすぐ始められます。
          </p>

          {error && (
            <div className="mt-4 rounded-2xl border border-[#f87171]/20 bg-[#f87171]/5 px-4 py-3 text-xs text-[#fca5a5]">
              {error}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3">
            {/* Google */}
            <button
              type="button"
              onClick={() => handleSignIn('google')}
              disabled={loading}
              className="flex min-h-[52px] w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-white/[0.10] hover:shadow-[0_8px_20px_-8px_rgba(125,211,252,0.25)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="text-white/50">接続中…</span>
              ) : (
                <>
                  <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span>Google で始める</span>
                </>
              )}
            </button>

            {/* Apple */}
            <button
              type="button"
              onClick={() => handleSignIn('apple')}
              disabled={loading}
              className="flex min-h-[52px] w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-white/[0.10] hover:shadow-[0_8px_20px_-8px_rgba(255,255,255,0.15)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="text-white/50">接続中…</span>
              ) : (
                <>
                  <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                  </svg>
                  <span>Apple で始める</span>
                </>
              )}
            </button>
          </div>

          <p className="mt-6 border-t border-white/[0.06] pt-5 text-center text-[10px] leading-relaxed text-white/28">
            続行することで利用規約とプライバシーポリシーに同意したものとみなされます。
          </p>
        </div>
      </div>
    </div>
  )
}
