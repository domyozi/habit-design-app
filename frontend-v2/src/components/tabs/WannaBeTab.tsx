import { useState, useEffect, useRef, useCallback, useContext } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { UserContextCtx } from '@/lib/user-context'
import {
  streamMandalaChart,
  streamCellSuggestions,
  generateIntakeQuestions,
  extractJsonBlock,
  stripJsonBlock,
  checkRateLimit,
  streamWannaBeReflection,
  extractMemoryPatch,
  mergeContextPatch,
  type MandalaData,
  type IntakeQuestion,
  type Granularity,
} from '@/lib/ai'
import {
  getWannaBe, getMandala, saveWannaBe, saveMandala, createHabit,
  getMandalaCheck, patchMandalaCheck, getMandalaTracked, patchMandalaTracked,
} from '@/lib/api'
import { MandalaGrid } from '@/components/mandala/MandalaGrid'
import { HabitSelectSheet } from '@/components/mandala/HabitSelectSheet'
import { CellSuggestionPanel } from '@/components/mandala/CellSuggestionPanel'

// 小さい進捗リング
const ProgressRing = ({ pct, size = 52, stroke = 6 }: { pct: number; size?: number; stroke?: number }) => {
  const r = (size - stroke) / 2
  const C = 2 * Math.PI * r
  const dash = `${(pct / 100) * C} ${C}`
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={pct >= 100 ? '#34d399' : '#7dd3fc'}
          strokeWidth={stroke}
          strokeDasharray={dash}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold text-white">{pct}%</span>
      </div>
    </div>
  )
}

type GenerateStep = 'input' | 'clarifying' | 'generating'

export const WannaBeTab = () => {
  const { session, loading: authLoading } = useAuth()
  const [userCtx, updateUserCtx] = useContext(UserContextCtx)

  // ─── Data state ───────────────────────────────────────────────
  const [mandala, setMandala] = useState<MandalaData | null>(null)
  const [wannaBeText, setWannaBeText] = useState('')
  const [input, setInput] = useState('')
  const [loadingData, setLoadingData] = useState(true)
  const [showInput, setShowInput] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Generate flow (Sprint C) ─────────────────────────────────
  const [generateStep, setGenerateStep] = useState<GenerateStep>('input')
  const [intakeQuestions, setIntakeQuestions] = useState<IntakeQuestion[]>([])
  const [loadingQuestions, setLoadingQuestions] = useState(false)
  const [streamText, setStreamText] = useState('')

  // ─── Daily check (F-18: API-backed, localStorage fallback) ──────
  const today = new Date().toISOString().slice(0, 10)
  const [checkedActions, setCheckedActions] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(`mandala:daily-check:${today}`) ?? '{}') }
    catch { return {} }
  })

  useEffect(() => {
    getMandalaCheck(today)
      .then(remote => { if (Object.keys(remote).length > 0) setCheckedActions(remote) })
      .catch(() => {})
  }, [today])

  const toggleAction = useCallback((elementIdx: number, actionIdx: number) => {
    const key = `${elementIdx}-${actionIdx}`
    setCheckedActions(prev => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem(`mandala:daily-check:${today}`, JSON.stringify(next))
      patchMandalaCheck(today, next).catch(() => {})
      return next
    })
  }, [today])

  const completedCount = Object.values(checkedActions).filter(Boolean).length
  const progressPct = mandala ? Math.round((completedCount / 64) * 100) : 0
  const themesDone = mandala?.elements.filter((el, i) =>
    el.actions.every((_, j) => checkedActions[`${i}-${j}`])
  ).length ?? 0

  // ─── Tracking targets (F-19: API-backed, localStorage fallback) ──
  const [trackedActions, setTrackedActions] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('mandala:tracked') ?? '{}') }
    catch { return {} }
  })

  useEffect(() => {
    getMandalaTracked()
      .then(remote => { if (Object.keys(remote).length > 0) setTrackedActions(remote) })
      .catch(() => {})
  }, [])

  const toggleTracked = useCallback((elementIdx: number, actionIdx: number) => {
    const key = `${elementIdx}-${actionIdx}`
    setTrackedActions(prev => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem('mandala:tracked', JSON.stringify(next))
      patchMandalaTracked({ [key]: next[key] }).catch(() => {})
      return next
    })
  }, [])

  // ─── WannaBe Reflection (音声/テキスト入力 + AI フィードバック) ─────
  const [reflectionInput, setReflectionInput] = useState('')
  const [reflectionFeedback, setReflectionFeedback] = useState('')
  const [reflectionLoading, setReflectionLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  const handleVoiceToggle = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR) {
      alert('このブラウザは音声入力に対応していません。')
      return
    }
    if (isRecording) {
      recognitionRef.current?.stop()
      setIsRecording(false)
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new SR()
    rec.lang = 'ja-JP'
    rec.continuous = true
    rec.interimResults = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join('')
      setReflectionInput(transcript)
    }
    rec.onend = () => setIsRecording(false)
    rec.start()
    recognitionRef.current = rec
    setIsRecording(true)
  }, [isRecording])

  const handleReflectionGenerate = useCallback(async () => {
    if (!reflectionInput.trim() || reflectionLoading) return
    if (!checkRateLimit('wannabe-reflection', 10_000)) {
      return
    }
    setReflectionLoading(true)
    setReflectionFeedback('')
    try {
      await streamWannaBeReflection(
        reflectionInput,
        userCtx,
        (accumulated) => setReflectionFeedback(accumulated),
        async (fullText) => {
          setReflectionFeedback(fullText)
          setReflectionLoading(false)
          // メモリ更新
          try {
            const patch = await extractMemoryPatch(fullText, userCtx)
            if (patch && Object.keys(patch).length > 0 && userCtx) {
              const merged = mergeContextPatch(userCtx, patch)
              await updateUserCtx(merged)
            }
          } catch { /* silent */ }
        },
      )
    } catch {
      setReflectionLoading(false)
    }
  }, [reflectionInput, reflectionLoading, userCtx, updateUserCtx])

  // ─── Cell selection + AI suggestions (Sprint B) ───────────────
  const [selectedAction, setSelectedAction] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestStreamText, setSuggestStreamText] = useState('')

  const handleSelectAction = useCallback((elementIdx: number, actionIdx: number) => {
    const key = `${elementIdx}-${actionIdx}`
    setSelectedAction(prev => prev === key ? null : key)
    setSuggestions([])
    setSuggestStreamText('')
  }, [])

  const handleAskAI = useCallback(async () => {
    if (!selectedAction || !mandala) return
    const [eIdx, aIdx] = selectedAction.split('-').map(Number)
    const el = mandala.elements[eIdx]
    if (!el) return

    const granularity = (userCtx?.granularity ?? localStorage.getItem('settings:profile:granularity') ?? 'adult') as Granularity
    setSuggestLoading(true)
    setSuggestions([])
    setSuggestStreamText('')

    try {
      await streamCellSuggestions(
        mandala.mainGoal,
        el.title,
        el.actions[aIdx] ?? '',
        granularity,
        (text) => { setSuggestStreamText(text) },
        (fullText) => {
          const parsed = extractJsonBlock<{ suggestions: string[] }>(fullText)
          if (parsed?.suggestions) setSuggestions(parsed.suggestions)
          setSuggestStreamText('')
          setSuggestLoading(false)
        },
      )
    } catch {
      setSuggestLoading(false)
    }
  }, [selectedAction, mandala])

  const handleApplySuggestion = useCallback((text: string) => {
    if (!selectedAction || !mandala) return
    const [eIdx, aIdx] = selectedAction.split('-').map(Number)
    const elements = mandala.elements.map((el, i) => {
      if (i !== eIdx) return el
      const actions = [...el.actions]
      actions[aIdx] = text
      return { ...el, actions }
    })
    const updated = { ...mandala, elements, updatedAt: new Date().toISOString() }
    setMandala(updated)
    saveMandala(updated).catch(e => console.error('マンダラ保存に失敗しました', e))
    setSelectedAction(null)
    setSuggestions([])
  }, [selectedAction, mandala])

  // ─── Habit sheet (existing) ───────────────────────────────────
  const [showHabitSheet, setShowHabitSheet] = useState(false)
  const [pendingMandalaForHabits, setPendingMandalaForHabits] = useState<MandalaData | null>(null)

  // ─── DB data fetch ────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !session) { setLoadingData(false); return }
    const fetchData = async () => {
      setLoadingData(true)
      try {
        const [wannaBeResult, mandalaResult] = await Promise.all([
          getWannaBe().catch(() => null),
          getMandala().catch(() => null),
        ])
        if (wannaBeResult) { setWannaBeText(wannaBeResult.text); setInput(wannaBeResult.text) }
        if (mandalaResult?.cells) {
          setMandala(mandalaResult.cells as MandalaData)
          setShowInput(false)
        }
      } catch (e) {
        console.error('データの復元に失敗しました', e)
      } finally {
        setLoadingData(false)
      }
    }
    fetchData()
  }, [session, authLoading])

  // ─── Mandala update (debounced save) ─────────────────────────
  const handleMandalaUpdate = useCallback((updated: MandalaData) => {
    setMandala(updated)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      saveMandala(updated).catch(e => console.error('マンダラ保存に失敗しました', e))
    }, 500)
  }, [])

  // ─── Step 1: intake questions (Sprint C) ─────────────────────
  const handleStartGenerate = async () => {
    if (!input.trim()) return
    if (!checkRateLimit('mandala-intake', 10_000)) {
      setError('少し間をおいてから再度お試しください。')
      return
    }
    setLoadingQuestions(true)
    setError(null)
    try {
      const questions = await generateIntakeQuestions(input)
      setIntakeQuestions(questions)
      setGenerateStep('clarifying')
    } catch {
      // fallback: skip intake and generate directly
      await doGenerate(input)
    } finally {
      setLoadingQuestions(false)
    }
  }

  const handleAnswerQuestion = (idx: number, answer: string) => {
    setIntakeQuestions(prev => prev.map((q, i) => i === idx ? { ...q, answer } : q))
  }

  // ─── Step 2: actual mandala generation ───────────────────────
  const doGenerate = async (baseInput: string) => {
    if (!checkRateLimit('mandala-generate', 30_000)) {
      setError('少し間をおいてから再度お試しください。')
      return
    }
    const answeredQuestions = intakeQuestions.filter(q => q.answer)
    const enrichedInput = answeredQuestions.length > 0
      ? `${baseInput}\n\n追加情報:\n${answeredQuestions.map(q => `- ${q.text} → ${q.answer}`).join('\n')}`
      : baseInput

    setGenerateStep('generating')
    setStreamText('')
    setMandala(null)
    setError(null)

    const granularity = (userCtx?.granularity ?? localStorage.getItem('settings:profile:granularity') ?? 'adult') as Granularity

    try {
      saveWannaBe(baseInput).catch(e => console.error('wanna_be 保存に失敗しました', e))

      await streamMandalaChart(
        enrichedInput,
        (accumulated) => setStreamText(stripJsonBlock(accumulated)),
        (fullText) => {
          const result = extractJsonBlock<Omit<MandalaData, 'createdAt' | 'updatedAt'>>(fullText)
          if (result && result.mainGoal && Array.isArray(result.elements) && result.elements.length > 0) {
            const elements = Array.from({ length: 8 }, (_, i) => {
              const el = result.elements[i] ?? { title: `要素${i + 1}`, actions: [] }
              const actions = Array.from({ length: 8 }, (_, j) => el.actions[j] ?? '')
              return { title: el.title || `要素${i + 1}`, actions }
            })
            const now = new Date().toISOString()
            const newMandala: MandalaData = { mainGoal: result.mainGoal, elements, createdAt: now, updatedAt: now }
            setMandala(newMandala)
            setShowInput(false)
            setStreamText('')
            setGenerateStep('input')
            setIntakeQuestions([])
            saveMandala(newMandala).catch(e => console.error('マンダラ保存に失敗しました', e))
            setPendingMandalaForHabits(newMandala)
            setShowHabitSheet(true)
          } else {
            setError('生成に失敗しました。もう一度お試しください。')
            setGenerateStep('input')
          }
        },
        granularity,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'API呼び出しに失敗しました。')
      setGenerateStep('input')
    }
  }

  // ─── Guard: unauthenticated ───────────────────────────────────
  if (!authLoading && !session) {
    return (
      <div className="space-y-4 px-4 py-4 pb-6">
        <div className="rounded-[28px] border border-[#9fb4d1]/10 bg-[linear-gradient(180deg,rgba(9,16,27,0.98),rgba(7,12,21,0.96))] px-4 py-5 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8da4c3]">Mandala chart</p>
          <p className="mt-2 text-lg font-semibold text-white">長期ゴールをマンダラチャートで構造化する</p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-[#0b1320]/90 px-4 py-8 text-center">
          <p className="text-sm text-white/60">この機能を使うにはログインが必要です。</p>
          <p className="mt-2 text-xs text-white/38">ログインすると、マンダラチャートがクラウドに保存されます。</p>
        </div>
      </div>
    )
  }

  if (authLoading || loadingData) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-[#7dd3fc]/60" />
      </div>
    )
  }

  return (
    <>
      {/* Habit selection sheet */}
      {showHabitSheet && pendingMandalaForHabits && (
        <HabitSelectSheet
          elements={pendingMandalaForHabits.elements}
          mainGoal={pendingMandalaForHabits.mainGoal}
          onConfirm={async (selectedTitles) => {
            for (const title of selectedTitles) {
              await createHabit(title, pendingMandalaForHabits.mainGoal).catch(e =>
                console.error('習慣の登録に失敗しました', e)
              )
            }
            setShowHabitSheet(false)
            setPendingMandalaForHabits(null)
          }}
          onSkip={() => { setShowHabitSheet(false); setPendingMandalaForHabits(null) }}
        />
      )}

      <div className="space-y-4 px-4 py-4 pb-6">

        {/* ── WannaBe リフレクション ─────────────────────────────────── */}
        <div className="rounded-[28px] border border-[#9fb4d1]/10 bg-[linear-gradient(180deg,rgba(9,16,27,0.98),rgba(7,12,21,0.96))] px-4 py-5 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8da4c3]">Wanna Be</p>
          <p className="mt-1 text-lg font-semibold text-white">リフレクション</p>
          <p className="mt-1 text-sm text-white/50">理想の自分・気づき・今感じていることを話してください</p>
        </div>

        {/* テキスト入力エリア */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#0b1320]/90 px-4 py-4">
          <textarea
            value={reflectionInput}
            onChange={e => setReflectionInput(e.target.value)}
            placeholder="今の自分、理想の姿、気づき、悩み、なんでも自由に話してください..."
            rows={6}
            className="w-full resize-none rounded-[20px] border border-white/10 bg-[#08101a] px-4 py-3 text-sm leading-7 text-white/88 placeholder-white/18 shadow-inner outline-none transition-colors focus:border-[#7dd3fc]/30"
          />
          <div className="mt-3 flex items-center gap-2">
            {/* 音声入力ボタン */}
            <button
              type="button"
              onClick={handleVoiceToggle}
              className={[
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors',
                isRecording
                  ? 'border-[#f87171]/40 bg-[#f87171]/10 text-[#f87171] animate-pulse'
                  : 'border-white/10 text-white/50 hover:border-white/25 hover:text-white/80',
              ].join(' ')}
            >
              <span>{isRecording ? '⏹' : '🎙'}</span>
              <span>{isRecording ? '録音中…' : '音声入力'}</span>
            </button>

            <div className="flex-1" />

            {reflectionInput.trim() && (
              <button
                type="button"
                onClick={() => setReflectionInput('')}
                className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-white/38 hover:text-white/70"
              >
                クリア
              </button>
            )}
            <button
              type="button"
              onClick={handleReflectionGenerate}
              disabled={!reflectionInput.trim() || reflectionLoading}
              className="rounded-full border border-[#7dd3fc]/30 bg-[#7dd3fc]/12 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#aee5ff] disabled:opacity-40"
            >
              {reflectionLoading ? 'フィードバック生成中…' : 'フィードバックを得る →'}
            </button>
          </div>
        </div>

        {/* フィードバック表示エリア */}
        {(reflectionFeedback || reflectionLoading) && (
          <div className="rounded-2xl border border-[#7dd3fc]/15 bg-[#05111e] px-4 py-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8ed8ff]/60">フィードバック</p>
            {reflectionFeedback ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">{reflectionFeedback}</p>
            ) : (
              <div className="flex items-center gap-2 text-sm text-white/40">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#7dd3fc]/60" />
                生成中…
              </div>
            )}
          </div>
        )}

        {/* マンダラチャート（非表示：データは保持） */}
        {false && <>
        <div className="rounded-[28px] border border-[#9fb4d1]/10 bg-[linear-gradient(180deg,rgba(9,16,27,0.98),rgba(7,12,21,0.96))] px-4 py-5 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8da4c3]">Mandala chart</p>
              <p className="mt-2 text-lg font-semibold text-white">長期ゴールをマンダラチャートで構造化する</p>
              <p className="mt-2 text-sm text-white/52">
                なりたい姿・目標を入力すると、AIが9×9のマンダラチャートを自動生成します。
              </p>
            </div>
            {mandala && (
              <div className="flex flex-shrink-0 flex-col items-center gap-1 print-hide">
                <ProgressRing pct={progressPct} />
                <p className="text-[9px] text-white/36">{completedCount}/64</p>
                {themesDone > 0 && (
                  <p className="text-[9px] text-[#34d399]">{themesDone}/8 テーマ</p>
                )}
              </div>
            )}
          </div>
          {mandala && (
            <div className="mt-3 flex items-center gap-2 print-hide">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/36 hover:text-white/70"
              >
                印刷
              </button>
              {/* F-15: スキップ後も習慣シートを再表示できるボタン */}
              <button
                type="button"
                onClick={() => { setPendingMandalaForHabits(mandala); setShowHabitSheet(true) }}
                className="rounded-full border border-[#7dd3fc]/25 bg-[#7dd3fc]/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#aee5ff]/70 hover:text-[#aee5ff] print-hide"
              >
                習慣を設定する
              </button>
            </div>
          )}
        </div>

        {/* Step: input */}
        {generateStep === 'input' && (showInput || !mandala) && (
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
              <p className="text-[11px] text-white/34">AIが質問して深掘りしてから生成します</p>
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
                  onClick={handleStartGenerate}
                  disabled={!input.trim() || loadingQuestions}
                  className="rounded-full border border-[#7dd3fc]/30 bg-[#7dd3fc]/12 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#aee5ff] disabled:opacity-40"
                >
                  {loadingQuestions ? '質問を生成中…' : 'マンダラを作る →'}
                </button>
              </div>
            </div>
            {error && <p className="mt-2 text-xs text-[#fecaca]">{error}</p>}
          </div>
        )}

        {/* Step: clarifying questions */}
        {generateStep === 'clarifying' && (
          <div className="rounded-2xl border border-[#7dd3fc]/20 bg-[#08111c]/95 px-5 py-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#7dd3fc]">Intake</p>
            <p className="mt-2 text-lg font-semibold text-white">もう少し教えてください</p>
            <p className="mt-1 text-sm text-white/52">
              回答するとマンダラチャートがより具体的になります。スキップしても大丈夫です。
            </p>

            <div className="mt-5 space-y-5">
              {intakeQuestions.map((q, qi) => (
                <div key={qi}>
                  <p className="mb-2 text-sm font-medium text-white/80">{q.text}</p>
                  <div className="flex flex-wrap gap-2">
                    {q.options.map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handleAnswerQuestion(qi, q.answer === opt ? '' : opt)}
                        className={[
                          'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                          q.answer === opt
                            ? 'border-[#7dd3fc]/50 bg-[#7dd3fc]/15 text-[#aee5ff]'
                            : 'border-white/[0.08] bg-white/[0.02] text-white/55 hover:border-white/25',
                        ].join(' ')}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => doGenerate(input)}
                className="flex-1 rounded-2xl border border-[#7dd3fc]/30 bg-[#7dd3fc]/12 py-3 text-sm font-semibold text-[#aee5ff] hover:bg-[#7dd3fc]/18"
              >
                マンダラを生成する
              </button>
              <button
                type="button"
                onClick={() => { setIntakeQuestions([]); setGenerateStep('input'); doGenerate(input) }}
                className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-white/42 hover:text-white/70"
              >
                スキップ
              </button>
            </div>
          </div>
        )}

        {/* Streaming output */}
        {streamText && generateStep === 'generating' && (
          <div className="rounded-2xl border border-[#7dd3fc]/15 bg-[#05111e] px-4 py-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8ed8ff]/60">AI が構造化中…</p>
            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-white/70">
              {streamText}
              <span className="ml-0.5 inline-block h-[1em] w-2 animate-pulse bg-[#7dd3fc]/70 align-middle" />
            </div>
          </div>
        )}

        {/* Mandala Grid */}
        {mandala && (() => {
          const m = mandala!
          return (
          <div className="rounded-2xl border border-white/[0.08] bg-[#0b1320]/90 px-4 py-4">
            <div className="mb-3 flex items-center justify-between gap-2 print-hide">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8da4c3]">Mandala chart</p>
                <p className="mt-1 text-sm font-semibold text-white/88">{m.mainGoal}</p>
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
                  onClick={() => { setMandala(null); setShowInput(true); setInput(wannaBeText); setGenerateStep('input') }}
                  className="rounded-full border border-[#f87171]/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f87171]/60 hover:text-[#f87171]"
                >
                  Reset
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-max">
                <MandalaGrid
                  data={m}
                  onUpdate={handleMandalaUpdate}
                  checkedActions={checkedActions}
                  onToggleAction={toggleAction}
                  onSelectAction={handleSelectAction}
                  selectedAction={selectedAction}
                  trackedActions={trackedActions}
                  onToggleTracked={toggleTracked}
                />
              </div>
            </div>
          </div>
          )
        })()}

        {/* AI Cell Suggestion Panel */}
        {selectedAction && mandala && (() => {
          const sa = selectedAction!
          const m = mandala!
          const [eIdx, aIdx] = sa.split('-').map(Number)
          const el = m.elements[eIdx]
          return el ? (
            <CellSuggestionPanel
              elementTitle={el.title}
              currentAction={el.actions[aIdx] ?? ''}
              suggestions={suggestions}
              loading={suggestLoading}
              streamText={suggestStreamText}
              onAsk={handleAskAI}
              onApply={handleApplySuggestion}
              onClose={() => { setSelectedAction(null); setSuggestions([]) }}
            />
          ) : null
        })()}

        {/* Legend */}
        {mandala && (() => {
          const m = mandala!
          return (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.01] px-4 py-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/28">要素一覧</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {m.elements.map((el, i) => {
                const color = [
                  '#7dd3fc','#a78bfa','#34d399','#f59e0b',
                  '#f87171','#fb923c','#c084fc','#86efac',
                ][i]
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
                    <span className="truncate text-[11px] text-white/55">{el.title}</span>
                  </div>
                )
              })}
            </div>
          </div>
          )
        })()}
        </>}
      </div>
    </>
  )
}
