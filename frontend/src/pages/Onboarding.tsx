/**
 * オンボーディング画面
 * TASK-0013: 認証画面・オンボーディング遷移実装
 *
 * Wanna Be 未設定ユーザーがログイン後に遷移するウェルカム画面。
 * 「なりたい自分」設定へ誘導する。
 *
 * 🔵 信頼性レベル: REQ-201・user-stories 1.1 より
 */
import { useNavigate } from 'react-router-dom'

const Onboarding = () => {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#020617] px-6 py-12">
      {/* 背景グロー */}
      <div
        className="pointer-events-none fixed left-[-10%] top-[-10%] h-[50vw] w-[50vw] rounded-full bg-emerald-500/10 blur-[120px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed bottom-[-20%] right-[-10%] h-[60vw] w-[60vw] rounded-full bg-sky-500/8 blur-[140px]"
        aria-hidden="true"
      />

      <div
        className="relative w-full max-w-lg rounded-3xl p-8"
        style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 24px 64px -12px rgba(0,0,0,0.6)',
        }}
      >
        {/* ロゴ */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <svg
              className="h-7 w-7 text-emerald-400"
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
          </div>
        </div>

        {/* タイトル */}
        <div className="mb-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">First Step</p>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            ようこそ！
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            最初に「なりたい自分」を設定しましょう。
            <br />
            AIがあなたの理想から逆算して、習慣を提案します。
          </p>
        </div>

        <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-sm font-semibold text-white">設定後にできること</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            長期目標の候補を確認し、日々の習慣をホーム画面ですぐに回し始められます。
          </p>
        </div>

        {/* ステップ説明 */}
        <ol className="mb-8 space-y-3">
          {[
            { step: '1', text: '「なりたい自分」を自由に書く' },
            { step: '2', text: 'AIが目標候補を提案する' },
            { step: '3', text: '目標に合った習慣を設計する' },
          ].map(({ step, text }) => (
            <li key={step} className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
                {step}
              </span>
              <span className="text-sm text-slate-300">{text}</span>
            </li>
          ))}
        </ol>

        {/* CTA */}
        <button
          type="button"
          onClick={() => navigate('/wanna-be')}
          className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 active:scale-[0.98]"
        >
          「なりたい自分」を設定する
        </button>
      </div>
    </div>
  )
}

export default Onboarding
