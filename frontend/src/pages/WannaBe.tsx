/**
 * Wanna Be設定・AI分析画面
 * TASK-0017: Wanna Be設定・AI分析ストリーミング画面実装
 * Design: AIDesigner dark premium — run 5881a102 (wanna-be)
 *
 * 機能:
 * - 現在の Wanna Be を取得してテキストエリアにプリロード（REQ-202）
 * - 「AIに相談する」で POST /api/wanna-be/analyze をストリーミング呼び出し
 * - AI分析結果・目標候補を WannaBeAnalysis コンポーネントで表示
 * - 目標候補を承認して POST /api/goals で保存（REQ-203）
 * - AI障害時はエラーメッセージのみ表示（EDGE-001）
 *
 * 🔵 信頼性レベル: REQ-201/202/203/204・NFR-002・EDGE-001 より
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { apiGet } from '@/lib/api'
import { useWannaBeAnalysis } from '@/hooks/useWannaBeAnalysis'
import { WannaBeAnalysis } from '@/components/ai/WannaBeAnalysis'
import { GoalList } from '@/components/wanna_be/GoalList'
import { Spinner } from '@/components/ui/Spinner'
import type { ApiResponse, WannaBe as WannaBeType, Goal } from '@/types/interfaces'

const WannaBe = () => {
  const navigate = useNavigate()
  const { isStreaming, streamedText, isDone, suggestedGoals, error, startAnalysis, reset } = useWannaBeAnalysis()

  const { data: wannaBeData } = useQuery<WannaBeType | null>({
    queryKey: ['wanna-be'],
    queryFn: async () => {
      try {
        const res = await apiGet<ApiResponse<WannaBeType>>('/api/wanna-be')
        return (res as ApiResponse<WannaBeType>).data ?? null
      } catch { return null }
    },
  })

  const { data: goalsData, refetch: refetchGoals } = useQuery<Goal[]>({
    queryKey: ['goals'],
    queryFn: async () => {
      try {
        const res = await apiGet<ApiResponse<Goal[]>>('/api/goals')
        const data = (res as ApiResponse<Goal[]>).data
        return Array.isArray(data) ? data : []
      } catch { return [] }
    },
  })

  const [inputText, setInputText] = useState<string | undefined>(undefined)
  const text = inputText ?? wannaBeData?.text ?? ''

  const handleAnalyze = () => {
    if (text.trim()) { reset(); startAnalysis(text.trim()) }
  }

  const isAnalyzing = isStreaming || streamedText.length > 0 || isDone || !!error

  return (
    <div className="relative overflow-x-hidden">
      {/* Aurora glows */}
      <div className="pointer-events-none absolute left-[-100px] top-[-100px] h-[300px] w-[300px] rounded-full bg-teal-500/[0.12] blur-[80px]" aria-hidden />
      <div className="pointer-events-none absolute right-[-50px] top-[40%] h-[250px] w-[250px] rounded-full bg-sky-600/[0.08] blur-[80px]" aria-hidden />
      <div className="pointer-events-none absolute bottom-[-100px] left-[10%] h-[350px] w-[350px] rounded-full bg-emerald-600/[0.06] blur-[80px]" aria-hidden />

      {/* ヘッダー */}
      <header
        className="sticky top-0 z-40 px-5 pb-4 pt-8"
        style={{ background: 'linear-gradient(to bottom, #020617 60%, transparent)' }}
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-300 transition-colors hover:text-white"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            aria-label="戻る"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Goal Setting</span>
            <h1 className="mt-0.5 text-base font-medium tracking-wide text-slate-50">Wanna Be</h1>
          </div>
          <div className="flex h-10 w-10 items-center justify-center text-emerald-400">
            <svg className="h-6 w-6 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 12c-2-2.5-4-4-6-4a4 4 0 0 0 0 8c2 0 4-1.5 6-4z" />
              <path d="M12 12c2 2.5 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.5-6 4z" />
            </svg>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="relative z-10 mx-auto w-full max-w-2xl space-y-6 px-5 pb-12 pt-2">
        <section
          className="rounded-[28px] border border-white/10 p-5"
          style={{
            background: 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
          }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">
            Design Your Direction
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            理想像から逆算して、次の目標を決める
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            抽象的でも構いません。AIが文章を読み取り、長期目標の候補と最初の習慣設計につながる形まで整理します。
          </p>
        </section>

        {/* 入力エリア */}
        <section className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <label htmlFor="wanna-be-input" className="flex items-center gap-2 text-sm font-medium text-slate-200">
              <svg className="h-4 w-4 text-emerald-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"/></svg>
              <span>なりたい自分</span>
            </label>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-slate-300">
              具体化はAIが補助
            </span>
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            仕事、生活、心身の状態など、半年から1年先にどうありたいかをそのまま書いてください。
          </p>
          <label htmlFor="wanna-be-input" className="sr-only">
            なりたい自分
          </label>
          <div className="group relative">
            <textarea
              id="wanna-be-input"
              value={text}
              onChange={e => setInputText(e.target.value)}
              placeholder="なりたい自分を自由に書いてください（例: 1年後の自分は毎朝6時に起き、英語でプレゼンできて...）"
              rows={5}
              className="w-full resize-none rounded-2xl p-4 text-sm leading-relaxed text-slate-50 placeholder-slate-500 outline-none transition-all"
              style={{
                background: 'rgba(255,255,255,0.02)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(16,185,129,0.5), inset 0 0 12px rgba(16,185,129,0.1)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.boxShadow = 'none' }}
            />
            <div className="absolute left-0 top-0 h-2 w-2 rounded-tl-xl border-l border-t border-white/20 transition-colors group-focus-within:border-emerald-500/50" />
            <div className="absolute bottom-0 right-0 h-2 w-2 rounded-br-xl border-b border-r border-white/20 transition-colors group-focus-within:border-emerald-500/50" />
          </div>
        </section>

        {/* CTAボタン */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={isStreaming || !text.trim()}
            className="group relative flex-1 transform transition-all duration-300 active:scale-[0.98] disabled:opacity-60"
          >
            <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 opacity-30 blur transition duration-500 group-hover:opacity-60 group-disabled:opacity-0" />
            <div className="relative flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-gradient-to-r from-emerald-600 to-teal-500 py-3.5 text-sm font-medium text-white shadow-[0_0_20px_rgba(16,185,129,0.2)]">
              {isStreaming ? (
                <><Spinner size="sm" tone="light" /><span>AIが目標を整理中...</span></>
              ) : (
                <><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg><span>AIに相談する</span></>
              )}
            </div>
          </button>
          {isAnalyzing && !isStreaming && (
            <button
              type="button"
              onClick={reset}
              className="rounded-xl px-4 py-3.5 text-sm text-slate-200 transition-colors hover:text-white"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              やり直す
            </button>
          )}
        </div>

        {/* AI分析結果 */}
        {isAnalyzing && (
          <WannaBeAnalysis
            isStreaming={isStreaming}
            streamedText={streamedText}
            isDone={isDone}
            suggestedGoals={suggestedGoals}
            error={error}
            wannaBeId={wannaBeData?.id}
            onSaved={() => { refetchGoals(); navigate('/') }}
          />
        )}

        {/* 長期目標一覧（REQ-203/204） */}
        <GoalList
          goals={(goalsData ?? []).map(g => ({ id: g.id, title: g.title, description: g.description }))}
        />
      </main>
    </div>
  )
}

export default WannaBe
