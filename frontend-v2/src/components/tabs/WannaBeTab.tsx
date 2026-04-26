import { useState } from 'react'
import { useLocalStorage } from '@/lib/storage'
import { streamMandalaChart, extractJsonBlock, stripJsonBlock, checkRateLimit, type MandalaData } from '@/lib/ai'
import { MandalaGrid } from '@/components/mandala/MandalaGrid'

export const WannaBeTab = () => {
  const [mandala, setMandala] = useLocalStorage<MandalaData | null>('wannabe:mandala', null)
  const [input, setInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [showInput, setShowInput] = useState(!mandala)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!input.trim() || generating) return
    if (!checkRateLimit('mandala-generate', 30_000)) {
      setError('少し間をおいてから再度お試しください。')
      return
    }
    setGenerating(true)
    setError(null)
    setStreamText('')
    setMandala(null)
    try {
      await streamMandalaChart(
        input,
        (accumulated) => setStreamText(stripJsonBlock(accumulated)),
        (fullText) => {
          const result = extractJsonBlock<Omit<MandalaData, 'createdAt' | 'updatedAt'>>(fullText)
          if (result && result.mainGoal && Array.isArray(result.elements) && result.elements.length > 0) {
            // Pad to 8 elements, each with 8 actions
            const elements = Array.from({ length: 8 }, (_, i) => {
              const el = result.elements[i] ?? { title: `要素${i + 1}`, actions: [] }
              const actions = Array.from({ length: 8 }, (_, j) => el.actions[j] ?? '')
              return { title: el.title || `要素${i + 1}`, actions }
            })
            const now = new Date().toISOString()
            setMandala({ mainGoal: result.mainGoal, elements, createdAt: now, updatedAt: now })
            setShowInput(false)
            setStreamText('')
          } else {
            setError('生成に失敗しました。もう一度お試しください。')
          }
          setGenerating(false)
        },
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'API呼び出しに失敗しました。')
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4 px-4 py-4 pb-6">
      {/* Header */}
      <div className="rounded-[28px] border border-[#9fb4d1]/10 bg-[linear-gradient(180deg,rgba(9,16,27,0.98),rgba(7,12,21,0.96))] px-4 py-5 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8da4c3]">Mandala chart</p>
        <p className="mt-2 text-lg font-semibold text-white">長期ゴールをマンダラチャートで構造化する</p>
        <p className="mt-2 text-sm text-white/52">
          なりたい姿・目標を入力すると、AIが9×9のマンダラチャートを自動生成します。各セルは手動で編集できます。
        </p>
      </div>

      {/* Input area */}
      {(showInput || !mandala) && (
        <div className="rounded-2xl border border-white/[0.08] bg-[#0b1320]/90 px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8da4c3]">目標・ビジョンを入力</p>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            maxLength={2000}
            placeholder="例:
・Anthropicに転職して世界最高水準のAIエンジニアになる
・身体的・精神的に人生最高のコンディションを維持する
・年収1000万円を達成して経済的自由を手に入れる

なりたい姿、長期ゴール、実現したいことを自由に書いてください。"
            rows={8}
            className="mt-3 w-full resize-y rounded-[20px] border border-white/10 bg-[#08101a] px-4 py-3 text-sm leading-7 text-white/88 placeholder-white/18 shadow-inner outline-none transition-colors focus:border-[#7dd3fc]/30"
          />
          <p className={['mt-1 text-right text-[10px]', input.length > 1800 ? 'text-[#fecaca]' : 'text-white/20'].join(' ')}>
            {input.length}/2000
          </p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[11px] text-white/34">入力内容を元にAIが8要素×8アクション（64項目）を自動生成します</p>
            <div className="flex items-center gap-2">
              {input.trim() && (
                <button
                  type="button"
                  onClick={() => setInput('')}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38 hover:text-white/70"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!input.trim() || generating}
                className="rounded-full border border-[#7dd3fc]/30 bg-[#7dd3fc]/12 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#aee5ff] disabled:opacity-40"
              >
                {generating ? 'Generating…' : 'Generate →'}
              </button>
            </div>
          </div>
          {error && <p className="mt-2 text-xs text-[#fecaca]">{error}</p>}
        </div>
      )}

      {/* Streaming output */}
      {streamText && !mandala && (
        <div className="rounded-2xl border border-[#7dd3fc]/15 bg-[#05111e] px-4 py-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8ed8ff]/60">AI が構造化中…</p>
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-white/70">
            {streamText}
            <span className="ml-0.5 inline-block h-[1em] w-2 animate-pulse bg-[#7dd3fc]/70 align-middle" />
          </div>
        </div>
      )}

      {/* Mandala Grid */}
      {mandala && (
        <div className="rounded-2xl border border-white/[0.08] bg-[#0b1320]/90 px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8da4c3]">Mandala chart</p>
              <p className="mt-1 text-sm font-semibold text-white/88">{mandala.mainGoal}</p>
            </div>
            <div className="flex items-center gap-2">
              {!showInput && (
                <button
                  type="button"
                  onClick={() => setShowInput(true)}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38 hover:text-white/70"
                >
                  再生成
                </button>
              )}
              <button
                type="button"
                onClick={() => { setMandala(null); setShowInput(true); setInput('') }}
                className="rounded-full border border-[#f87171]/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f87171]/60 hover:text-[#f87171]"
              >
                Reset
              </button>
            </div>
          </div>
          <MandalaGrid
            data={mandala}
            onUpdate={updated => setMandala(updated)}
          />
        </div>
      )}

      {/* Legend */}
      {mandala && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.01] px-4 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/28">要素一覧</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {mandala.elements.map((el, i) => {
              const color = [
                '#7dd3fc','#a78bfa','#34d399','#f59e0b',
                '#f87171','#fb923c','#c084fc','#86efac',
              ][i]
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
                  <span className="text-[11px] text-white/55 truncate">{el.title}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
