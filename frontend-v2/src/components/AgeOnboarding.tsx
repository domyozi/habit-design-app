import { useState } from 'react'
import { patchUserProfile } from '@/lib/api'

interface AgeOnboardingProps {
  onComplete: () => void
}

/**
 * 利用開始時に年齢を確認するオンボーディング画面。
 * AI への語調・難易度ヒントとしてのみ使用する（公開しない）。
 */
export const AgeOnboarding = ({ onComplete }: AgeOnboardingProps) => {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const parsed = value.trim() === '' ? null : Number(value)
  const isValid = parsed !== null && Number.isInteger(parsed) && parsed >= 0 && parsed <= 150

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || parsed === null) {
      setError('0〜150 の整数で入力してください')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await patchUserProfile({ age: parsed })
      onComplete()
    } catch {
      setError('保存に失敗しました。通信状況を確認してもう一度お試しください。')
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#05080d] px-4">
      <div className="pointer-events-none absolute left-[-10%] top-[-10%] h-[50vw] w-[50vw] rounded-full bg-[#7dd3fc]/6 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-20%] right-[-10%] h-[60vw] w-[60vw] rounded-full bg-[#a78bfa]/5 blur-[140px]" />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-sm rounded-[28px] px-7 py-8"
        style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow: '0 24px 64px -12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8da4c3]">
          Welcome
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
          まずは年齢を教えてください
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-white/52">
          AI コーチがあなたに合った語調・難易度でアクションを提案するためのヒントとして使います。後から設定画面で変更できます。
        </p>

        <div className="mt-6">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
            Age
          </label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={150}
            step={1}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="例: 30"
            className="mt-2 w-full rounded-2xl border border-white/[0.12] bg-[#08111c] px-4 py-3 text-base text-white/90 placeholder-white/20 focus:border-[#7dd3fc]/40 focus:outline-none"
          />
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-[#f87171]/20 bg-[#f87171]/5 px-4 py-3 text-xs text-[#fca5a5]">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!isValid || submitting}
          className="mt-6 flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-[#7dd3fc]/40 bg-[#7dd3fc]/15 px-4 text-sm font-semibold text-[#aee5ff] transition-all hover:-translate-y-0.5 hover:bg-[#7dd3fc]/25 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
        >
          {submitting ? '保存中…' : '次へ'}
        </button>
      </form>
    </div>
  )
}
