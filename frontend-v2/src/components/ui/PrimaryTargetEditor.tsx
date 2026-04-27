import { useState, useEffect } from 'react'
import { generateJournalBrief, type JournalBriefResult } from '@/lib/ai'

interface PrimaryTargetEditorProps {
  journal: string
  currentGoal: string | null
  identity: string
  existingTaskLabels: string[]
  onApply: (result: { target: string; tasks: JournalBriefResult['tasks'] }) => void
  onClose: () => void
}

export const PrimaryTargetEditor = ({
  journal,
  currentGoal,
  identity,
  existingTaskLabels,
  onApply,
  onClose,
}: PrimaryTargetEditorProps) => {
  const [text, setText] = useState(journal)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<JournalBriefResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const existingSet = new Set(existingTaskLabels.map(l => l.toLowerCase()))

  // 結果が出たとき、重複でないタスクをデフォルト全選択
  useEffect(() => {
    if (!result) return
    const indices = new Set(
      result.tasks
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => !existingSet.has(t.label.toLowerCase()))
        .map(({ i }) => i)
    )
    setSelectedIndices(indices)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  const toggleTaskSelect = (i: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev)
      if (next.has(i)) { next.delete(i) } else { next.add(i) }
      return next
    })
  }

  const handleGenerate = async () => {
    if (!text.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      const brief = await generateJournalBrief(text, { currentGoal, identity, existingTaskLabels })
      if (brief) {
        setResult(brief)
      } else {
        setError('解析に失敗しました。もう一度お試しください。')
      }
    } catch {
      setError('APIの呼び出しに失敗しました。ログイン状態またはサーバー側のAI設定を確認してください。')
    } finally {
      setLoading(false)
    }
  }

  const handleApplySelected = () => {
    if (!result) return
    const selected = result.tasks.filter((_, i) => selectedIndices.has(i))
    onApply({ target: result.primary_target, tasks: selected })
  }

  const handleApplyTargetOnly = () => {
    if (!result) return
    onApply({ target: result.primary_target, tasks: [] })
  }

  return (
    <div className="border-b border-white/[0.06] bg-[#05090f]/95 px-4 py-4 backdrop-blur-xl">
      <div className="mx-auto max-w-3xl">
        {/* Header row */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#8da4c3]">
            Morning journal brief
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45 hover:text-white/70"
          >
            Close
          </button>
        </div>

        {/* Textarea */}
        <div className="relative">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            maxLength={3000}
            rows={6}
            placeholder="今日の宣言、気分、懸念、やることを自由に書いてください..."
            className="w-full resize-y rounded-2xl border border-white/[0.08] bg-[#0b1320] px-3 py-3 text-sm leading-relaxed text-white/82 placeholder-white/20 focus:border-[#7dd3fc]/30 focus:outline-none"
          />
          {text.length > 2400 && (
            <span className={['absolute bottom-2 right-3 text-[10px]', text.length > 2700 ? 'text-[#fecaca]' : 'text-white/30'].join(' ')}>
              {text.length}/3000
            </span>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          {error && (
            <p className="text-xs text-[#fecaca]">{error}</p>
          )}
          {!error && !result && (
            <p className="text-xs text-white/32">
              ジャーナルを元に Primary Target・タスク・フィードバックを生成します
            </p>
          )}
          {result && !error && (
            <p className="text-xs text-white/32">生成完了 — 内容を確認して適用してください</p>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !text.trim()}
            className="ml-auto shrink-0 rounded-full border border-[#7dd3fc]/30 bg-[#7dd3fc]/12 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#aee5ff] disabled:opacity-40"
          >
            {loading ? 'Generating…' : result ? 'Regenerate' : 'Generate →'}
          </button>
        </div>

        {/* Results */}
        {result && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {/* Feedback */}
            <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Feedback</p>
              <p className="mt-2 text-sm leading-relaxed text-white/72">{result.feedback}</p>
            </div>

            {/* Primary target */}
            <div className="rounded-2xl border border-[#7dd3fc]/18 bg-[#7dd3fc]/5 px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8ed8ff]">Primary target</p>
                <button
                  type="button"
                  onClick={handleApplyTargetOnly}
                  className="shrink-0 rounded-full border border-[#7dd3fc]/30 bg-[#7dd3fc]/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#aee5ff]"
                >
                  Apply
                </button>
              </div>
              <p className="mt-2 text-sm font-semibold text-white">{result.primary_target}</p>
              {currentGoal && (
                <p className="mt-2 text-[11px] text-white/32">現在: {currentGoal}</p>
              )}
            </div>

            {/* Tasks */}
            <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
                  Tasks ({result.tasks.length})
                </p>
                {result.tasks.length > 0 && selectedIndices.size > 0 && (
                  <button
                    type="button"
                    onClick={handleApplySelected}
                    className="shrink-0 rounded-full border border-[#34d399]/25 bg-[#34d399]/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7ef0be]"
                  >
                    Apply ({selectedIndices.size})
                  </button>
                )}
              </div>
              <div className="mt-2 space-y-1.5">
                {result.tasks.length === 0 && (
                  <p className="text-xs text-white/32">新規タスクなし</p>
                )}
                {result.tasks.map((task, i) => {
                  const isDupe = existingSet.has(task.label.toLowerCase())
                  const isSelected = selectedIndices.has(i)
                  return (
                    <button
                      key={`${task.label}-${i}`}
                      type="button"
                      disabled={isDupe}
                      onClick={() => !isDupe && toggleTaskSelect(i)}
                      className={[
                        'w-full rounded-xl border px-2.5 py-2 text-left transition-all',
                        isDupe ? 'border-white/[0.04] bg-white/[0.01] opacity-40 cursor-default' :
                          isSelected ? 'border-[#34d399]/30 bg-[#34d399]/8' : 'border-white/[0.06] bg-[#09111c] hover:border-white/[0.12]',
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-1.5">
                        {!isDupe && (
                          <span className={[
                            'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors',
                            isSelected ? 'border-[#34d399]/60 bg-[#34d399]/20' : 'border-white/20',
                          ].join(' ')}>
                            {isSelected && (
                              <svg viewBox="0 0 10 10" className="h-2 w-2" fill="none">
                                <path d="M2 5l2.5 2.5L8 3" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                        )}
                        <span className={['text-[10px] rounded px-1 py-0.5 font-semibold uppercase', task.section === 'morning-must' ? 'bg-[#ff6b35]/12 text-[#ff9966]' : 'bg-[#f59e0b]/10 text-[#fbd38d]'].join(' ')}>
                          {task.section === 'morning-must' ? 'must' : 'routine'}
                        </span>
                        <p className="text-xs text-white/80">{task.label}</p>
                        {isDupe && <span className="ml-auto text-[10px] text-white/30">既存</span>}
                      </div>
                      <p className="mt-1 text-[11px] text-white/36">{task.reason}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
