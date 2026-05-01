/**
 * ログイン画面
 * TASK-0013: 認証画面・オンボーディング遷移実装
 * Design: AIDesigner run cd8e261e — Premium dark AI tool homepage
 *
 * 【機能概要】:
 * - Google / Apple OAuth でのログインボタンを表示する
 * - ログイン後、Wanna Be の設定状態で /onboarding または / へ遷移
 *
 * 🔵 信頼性レベル: REQ-101/102・user-stories 1.1 より
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Spinner } from '@/components/ui/Spinner'
import { apiGet } from '@/lib/api'

export const Login = () => {
  const [errorMessage, setErrorMessage] = useState('')
  const [isRouting, setIsRouting] = useState(false)
  const { signIn, isLoading, isAuthenticated } = useAuthStore()
  const navigate = useNavigate()

  /**
   * 【ログイン後ルーティング】: Wanna Be 設定状態で遷移先を判定
   * 🔵 REQ-201・user-stories 1.1 より
   */
  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false

    setIsRouting(true)
    apiGet('/api/wanna-be')
      .then(() => {
        if (!cancelled) navigate('/')
      })
      .catch((err: { response?: { status: number } }) => {
        if (!cancelled) {
          navigate(err?.response?.status === 404 ? '/onboarding' : '/')
        }
      })
      .finally(() => {
        if (!cancelled) setIsRouting(false)
      })

    return () => { cancelled = true }
  }, [isAuthenticated, navigate])

  const handleSignIn = async (provider: 'google' | 'apple') => {
    setErrorMessage('')
    try {
      await signIn(provider)
    } catch {
      setErrorMessage('ログインに失敗しました。もう一度お試しください。')
    }
  }

  const isDisabled = isLoading || isRouting

  return (
    <main className="login-shell relative min-h-screen overflow-hidden bg-[#020617] text-white">
      {/* ── 浮遊グロー（エメラルド & スカイ） ── */}
      <div
        className="pointer-events-none absolute left-[-10%] top-[-10%] h-[50vw] w-[50vw] rounded-full bg-emerald-500/10 blur-[120px] motion-aurora motion-aurora-a"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-[-20%] right-[-10%] h-[60vw] w-[60vw] rounded-full bg-sky-500/10 blur-[140px] motion-aurora motion-aurora-b"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-[30%] top-[40%] h-[30vw] w-[30vw] rounded-full bg-indigo-500/5 blur-[100px] motion-aurora motion-aurora-c"
        aria-hidden="true"
      />

      {/* ── ミニマルヘッダー ── */}
      <header className="absolute top-0 z-50 flex w-full items-center justify-between px-8 py-6">
        <div className="flex items-center gap-2">
          {/* ∞ ロゴマーク */}
          <svg
            className="h-6 w-6 text-emerald-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 12c-2-2.5-4-4-6-4a4 4 0 0 0 0 8c2 0 4-1.5 6-4z" />
            <path d="M12 12c2 2.5 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.5-6 4z" />
          </svg>
          <span className="mt-0.5 text-sm font-bold uppercase tracking-widest text-white">
            Habit Design
          </span>
        </div>
        {/* ナビリンクは将来のランディングページ実装時に追加 */}
      </header>

      {/* ── メインレイアウト ── */}
      <div className="relative z-10 mx-auto grid min-h-screen max-w-[1800px] grid-cols-1 items-center gap-10 px-6 pb-12 pt-24 lg:grid-cols-12 lg:gap-12 lg:px-16 lg:py-0">
        {/* ── 右カラム: ログインカード ── */}
        <section className="col-span-1 flex items-center justify-center lg:col-span-5 lg:justify-end">
          <div
            className="pointer-events-none absolute inset-0 scale-[0.98] rounded-[2.5rem] bg-gradient-to-br from-white/5 to-transparent opacity-50 blur-xl"
            aria-hidden="true"
          />

          <div
            className="animate-fade-in-up relative w-full max-w-[440px] rounded-[2rem] p-7 lg:p-10"
            style={{
              background: 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 24px 64px -12px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255,255,255,0.1)',
            }}
          >
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">
                  Start Today
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  ワークスペースへ
                </h2>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-right">
                <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-300/70">Flow</p>
                <p className="text-sm font-semibold text-white">3分で開始</p>
              </div>
            </div>

            <p className="mb-6 text-sm leading-relaxed text-slate-300">
              ログインすると、理想の姿から逆算した習慣設計をすぐ始められます。
            </p>

            {errorMessage && (
              <div
                role="alert"
                className="mb-5 rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100"
              >
                {errorMessage}
              </div>
            )}

            <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ['1', 'なりたい姿を書く'],
                  ['2', 'AIが目標化'],
                  ['3', '毎日の習慣に落とす'],
                ].map(([step, label]) => (
                  <div key={step} className="rounded-2xl bg-white/[0.03] px-2 py-3">
                    <p className="text-xs font-bold text-emerald-300">{step}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleSignIn('google')}
                disabled={isDisabled}
                data-testid="google-sign-in"
                className="group relative flex min-h-[52px] w-full items-center justify-center gap-3 rounded-xl border border-white/12 bg-white/8 px-4 text-sm font-medium text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.12] hover:shadow-[0_8px_20px_-8px_rgba(34,197,94,0.3)] active:scale-[0.98] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDisabled ? (
                  <>
                    <Spinner size="sm" tone="light" />
                    <span>接続中...</span>
                  </>
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

              <button
                onClick={() => handleSignIn('apple')}
                disabled={isDisabled}
                data-testid="apple-sign-in"
                className="group flex min-h-[52px] w-full items-center justify-center gap-3 rounded-xl border border-white/12 bg-white/8 px-4 text-sm font-medium text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.12] hover:shadow-[0_8px_20px_-8px_rgba(255,255,255,0.2)] active:scale-[0.98] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDisabled ? (
                  <>
                    <Spinner size="sm" tone="light" />
                    <span>接続中...</span>
                  </>
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

            <p className="mt-6 border-t border-white/[0.06] pt-5 text-center text-[11px] leading-relaxed text-slate-400">
              続行することで
              <a href="#" className="mx-0.5 text-slate-200 underline underline-offset-2 decoration-white/20 transition-colors hover:text-emerald-400">
                利用規約
              </a>
              と
              <a href="#" className="mx-0.5 text-slate-200 underline underline-offset-2 decoration-white/20 transition-colors hover:text-emerald-400">
                プライバシーポリシー
              </a>
              に同意したものとみなされます。
            </p>
          </div>
        </section>

        {/* ── 左カラム: ブランドコピー ── */}
        <section className="col-span-1 flex flex-col items-start justify-center lg:col-span-7 lg:pr-20">
          <div className="animate-fade-in-up w-full">
            <div className="mb-6 flex items-center gap-3">
              <div className="h-px w-8 bg-gradient-to-r from-emerald-400/50 to-transparent" />
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400/80">
                AI-native habit system
              </span>
            </div>

            <h1
              className="mb-5 font-['Iowan_Old_Style','Palatino_Linotype','Book_Antiqua',Georgia,serif] font-semibold text-white"
              style={{ fontSize: 'clamp(2.4rem, 4.8vw, 4.5rem)', lineHeight: '1.12', letterSpacing: '-0.02em' }}
            >
              <span className="block text-slate-100">未来の自分に、</span>
              <span className="mt-2 inline-block bg-gradient-to-r from-emerald-400 via-teal-300 to-sky-400 bg-clip-text text-transparent">
                今の習慣を合わせる。
              </span>
            </h1>

            <p className="mb-8 max-w-xl text-base font-light leading-relaxed text-slate-300 lg:text-xl">
              AI と一緒に「なりたい自分」から逆算して習慣を組み立てるワークスペース。
              毎日戻りたくなる静かな高揚感を設計します。
            </p>

            <div className="mb-8 flex flex-wrap gap-3">
              {[
                { label: 'Clarity', color: 'text-emerald-400' },
                { label: 'Momentum', color: 'text-sky-400' },
                { label: 'Taste', color: 'text-indigo-400' },
              ].map(({ label, color }) => (
                <span
                  key={label}
                  className="flex cursor-default items-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm text-slate-300 backdrop-blur-md transition-colors hover:bg-white/[0.12]"
                >
                  <span className={`text-xs ${color}`}>◆</span>
                  {label}
                </span>
              ))}
            </div>
            <div className="grid gap-3 text-sm text-slate-300 lg:max-w-xl lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Clarity</p>
                <p className="mt-2 leading-relaxed">抽象的な願望を、そのままでは終わらせず長期目標へ変換します。</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Momentum</p>
                <p className="mt-2 leading-relaxed">今日の習慣まで落とすので、着想と実行の距離が短くなります。</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
