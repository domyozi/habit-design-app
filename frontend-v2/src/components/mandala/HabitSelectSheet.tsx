import { useState } from 'react'
import type { MandalaElement } from '@/lib/ai'

interface HabitSelectSheetProps {
  elements: MandalaElement[]
  mainGoal: string
  onConfirm: (selectedTitles: string[]) => Promise<void>
  onSkip: () => void
}

export const HabitSelectSheet = ({ elements, mainGoal, onConfirm, onSkip }: HabitSelectSheetProps) => {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const toggle = (title: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(title)) { next.delete(title) } else { next.add(title) }
      return next
    })
  }

  const handleConfirm = async () => {
    if (selected.size === 0) { onSkip(); return }
    setSaving(true)
    try {
      await onConfirm(Array.from(selected))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-4 backdrop-blur-sm sm:items-center">
      <div
        className="w-full max-w-md rounded-[28px] px-6 py-6"
        style={{
          background: 'linear-gradient(160deg, rgba(11,19,32,0.98) 0%, rgba(7,12,21,0.96) 100%)',
          border: '1px solid rgba(125,211,252,0.15)',
          boxShadow: '0 32px 80px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#7dd3fc]">
          Habit candidates
        </p>
        <h2 className="mt-2 text-lg font-semibold text-white">
          朝ルーティンに習慣を追加しますか？
        </h2>
        <p className="mt-1.5 text-sm text-white/52">
          「{mainGoal}」から導き出した8つの柱から選択してください。
        </p>

        <div className="mt-5 space-y-2">
          {elements.map((el, i) => {
            if (!el.title) return null
            const isChecked = selected.has(el.title)
            return (
              <button
                key={`${el.title}-${i}`}
                type="button"
                onClick={() => toggle(el.title)}
                className={[
                  'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all',
                  isChecked
                    ? 'border-[#7dd3fc]/40 bg-[#7dd3fc]/10'
                    : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-all',
                    isChecked ? 'border-[#7dd3fc] bg-[#7dd3fc]' : 'border-white/20',
                  ].join(' ')}
                >
                  {isChecked && (
                    <svg className="h-3 w-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="text-sm text-white/85">{el.title}</span>
              </button>
            )
          })}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="flex-1 rounded-2xl border border-[#7dd3fc]/30 bg-[#7dd3fc]/12 py-3 text-sm font-semibold text-[#aee5ff] transition-all hover:bg-[#7dd3fc]/18 disabled:opacity-50"
          >
            {saving ? '登録中…' : selected.size > 0 ? `${selected.size}件を追加する` : '追加する'}
          </button>
          <button
            type="button"
            onClick={onSkip}
            disabled={saving}
            className="rounded-2xl border border-white/10 px-5 py-3 text-sm text-white/42 hover:text-white/70 disabled:opacity-50"
          >
            スキップ
          </button>
        </div>
      </div>
    </div>
  )
}
