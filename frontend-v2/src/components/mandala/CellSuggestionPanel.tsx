interface CellSuggestionPanelProps {
  elementTitle: string
  currentAction: string
  suggestions: string[]
  loading: boolean
  streamText: string
  onAsk: () => void
  onApply: (text: string) => void
  onClose: () => void
}

export const CellSuggestionPanel = ({
  elementTitle,
  currentAction,
  suggestions,
  loading,
  streamText,
  onAsk,
  onApply,
  onClose,
}: CellSuggestionPanelProps) => {
  return (
    <div className="rounded-[24px] border border-[#7dd3fc]/20 bg-[#08111c]/95 px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#7dd3fc]">
            AI提案 · {elementTitle}
          </p>
          <p className="mt-1.5 text-sm text-white/72">{currentAction}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-white/30 hover:text-white/70"
        >
          ✕
        </button>
      </div>

      <div className="mt-4">
        {suggestions.length === 0 && !loading && (
          <button
            type="button"
            onClick={onAsk}
            className="flex items-center gap-2 rounded-2xl border border-[#7dd3fc]/30 bg-[#7dd3fc]/10 px-4 py-2.5 text-sm font-medium text-[#aee5ff] transition-all hover:bg-[#7dd3fc]/18"
          >
            <span>✦</span>
            <span>AI案を出す</span>
          </button>
        )}

        {loading && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-[#7dd3fc]/60">生成中…</p>
            <p className="text-xs leading-relaxed text-white/50">
              {streamText.replace(/```json[\s\S]*?```/g, '').trim() || '考えています…'}
              <span className="ml-0.5 inline-block h-[0.9em] w-1.5 animate-pulse bg-[#7dd3fc]/60 align-middle" />
            </p>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/36">代替案を選んで適用</p>
            {suggestions.map((s, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3"
              >
                <span className="mt-0.5 shrink-0 text-[10px] font-mono text-white/30">{i + 1}</span>
                <p className="flex-1 text-sm leading-relaxed text-white/80">{s}</p>
                <button
                  type="button"
                  onClick={() => onApply(s)}
                  className="shrink-0 rounded-full border border-[#7dd3fc]/30 bg-[#7dd3fc]/10 px-3 py-1 text-[11px] font-semibold text-[#aee5ff] hover:bg-[#7dd3fc]/18"
                >
                  適用
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={onAsk}
              className="mt-1 text-[11px] text-white/32 hover:text-white/60"
            >
              再生成する
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
