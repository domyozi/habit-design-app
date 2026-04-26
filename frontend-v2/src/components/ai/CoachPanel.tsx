import { useState } from 'react'
import { generateCoachBrief, type CoachBrief } from '@/lib/ai'
import type { CoachAction, CoachSnapshot } from '@/lib/coach'

interface CoachPanelProps {
  snapshot: CoachSnapshot
  onAction?: (action: CoachAction) => void
  className?: string
}

export const CoachPanel = ({ snapshot, onAction, className = '' }: CoachPanelProps) => {
  const [loading, setLoading] = useState(false)
  const [aiBrief, setAiBrief] = useState<CoachBrief | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const actions = aiBrief?.next_actions.length
    ? aiBrief.next_actions.map(item => ({ title: item.title, detail: item.detail }))
    : snapshot.actions

  const risks = aiBrief?.risks?.length ? aiBrief.risks : snapshot.risks
  const sources = aiBrief?.sources ?? []

  const handleGenerate = async () => {
    if (!snapshot.aiPrompt || loading) return
    setLoading(true)
    setError(null)

    try {
      const brief = await generateCoachBrief(snapshot.aiPrompt)
      if (brief) {
        setAiBrief(brief)
      } else {
        setError('コーチブリーフを構造化できませんでした。')
      }
    } catch {
      setError('コーチブリーフの取得に失敗しました。')
    } finally {
      setLoading(false)
    }
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className={`flex flex-col items-center justify-center gap-2 rounded-[20px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(9,16,27,0.98),rgba(7,12,21,0.96))] px-2 py-4 text-white/40 shadow-[0_28px_90px_rgba(0,0,0,0.28)] transition-colors hover:text-white/70 ${className}`}
        style={{ minHeight: 120, width: 36 }}
      >
        <span className="text-[9px]">▶</span>
        <span className="text-[10px] tracking-[0.15em] text-white/40" style={{ writingMode: 'vertical-rl' }}>Coach</span>
      </button>
    )
  }

  return (
    <aside className={`rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(9,16,27,0.98),rgba(7,12,21,0.96))] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.28)] ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.12em] text-[#8da4c3]">{snapshot.heading}</p>
          <p className="mt-2 text-sm font-semibold text-white/86">{snapshot.status}</p>
        </div>
        <div className="flex items-center gap-2">
          {snapshot.aiPrompt && (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="rounded-full border border-[#7dd3fc]/30 bg-[#7dd3fc]/10 px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] text-[#aee5ff] disabled:opacity-40"
            >
              {loading ? '生成中…' : 'コーチに聞く'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="text-white/30 hover:text-white/60 text-[11px] px-1"
            title="収納"
          >
            ◀
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <p className="text-[10px] font-semibold tracking-[0.12em] text-white/35">次のアクション</p>
        <div className="space-y-2">
          {actions.map((action, index) => (
            <div key={`${action.title}-${index}`} className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-white/[0.18] bg-white/[0.03]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white/86">{action.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/42">{action.detail}</p>
                {onAction && snapshot.actions[index]?.tab && (
                  <button
                    type="button"
                    onClick={() => onAction(snapshot.actions[index])}
                    className="mt-3 rounded-full border border-white/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/52 hover:text-white"
                  >
                    {snapshot.actions[index].ctaLabel ?? 'Open'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {sources.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-[10px] font-semibold tracking-[0.12em] text-white/35">根拠</p>
          {sources.map((source, index) => (
            <div key={`${source.title}-${index}`} className="rounded-2xl border border-[#7dd3fc]/12 bg-[#7dd3fc]/5 px-3 py-2">
              <p className="text-xs font-semibold text-[#b9e6ff]">{source.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-white/52">{source.claim}</p>
            </div>
          ))}
        </div>
      )}

      {risks.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-[10px] font-semibold tracking-[0.12em] text-white/35">リスク</p>
          {risks.map((risk, index) => (
            <div key={`${risk}-${index}`} className="rounded-2xl border border-[#f59e0b]/15 bg-[#f59e0b]/5 px-3 py-2 text-xs leading-relaxed text-white/52">
              {risk}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-2xl border border-[#fca5a5]/18 bg-[#fca5a5]/6 px-3 py-2 text-xs text-[#fecaca]">
          {error}
        </div>
      )}
    </aside>
  )
}
