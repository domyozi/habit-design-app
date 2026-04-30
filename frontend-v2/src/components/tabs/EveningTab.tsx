import { useState, useEffect, useRef } from 'react'
import { useDailyStorage, todayKey } from '@/lib/storage'
import { AiMark } from '@/components/ui/AiMark'
import { byTimingGrouped, useTodoDefinitions, HABIT_CATEGORIES } from '@/lib/todos'
import { TaskFieldRow, type TaskFieldItem } from '@/components/ui/TaskField'
import { streamEveningFeedback, checkRateLimit, extractMemoryPatch, mergeContextPatch } from '@/lib/ai'
import { useUserContext } from '@/lib/user-context'
import { saveEveningFeedback, loadEveningFeedback, saveEveningNotes, loadEveningNotes } from '@/lib/api'

interface CheckItem { id: string; label: string; minutes?: number }

// CheckRow は後方互換のために残す（export で使用済みとみなす）
export const CheckRow = ({ item, checked, onToggle }: { item: CheckItem; checked: boolean; onToggle: () => void }) => (
  <div className={['flex items-center gap-3 border-t border-white/[0.05] px-4 py-3', checked ? 'opacity-50' : ''].join(' ')}>
    <button
      type="button"
      onClick={onToggle}
      data-testid={`evening-check-${item.id}`}
      className={['w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors',
        checked ? 'bg-[#c4b5fd] border-[#c4b5fd]' : 'border-white/20 hover:border-white/40'].join(' ')}
    >
      {checked && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
    </button>
    <span className={['flex-1 text-sm', checked ? 'text-white/28 line-through' : 'text-white/82'].join(' ')}>{item.label}</span>
    {item.minutes && <span className="text-[11px] text-white/24">{item.minutes}m</span>}
  </div>
)


const formatDate = () => {
  const d = new Date()
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）`
}

const starStr = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)

export const EveningTab = ({
  boss: bossProp,
  onGenerateReport,
  onComplete,
  viewDate,
}: {
  boss?: string | null
  onGenerateReport?: (text: string) => void
  onComplete?: () => void
  viewDate?: string
}) => {
  const dateKey = viewDate ?? todayKey()
  const isReadOnly = dateKey !== todayKey()
  const [userCtx, updateUserCtx] = useUserContext()
  const [todoDefinitions] = useTodoDefinitions()
  const eveningGrouped = byTimingGrouped(todoDefinitions, 'evening')
  // 夜の全タスクをカテゴリ順にフラット化
  const ALL_EVENING_ITEMS: TaskFieldItem[] = HABIT_CATEGORIES.flatMap(cat =>
    eveningGrouped[cat.id].map(item => ({
      id: item.id,
      label: item.label,
      minutes: item.minutes,
      field_type: item.field_type,
      field_options: item.field_options,
    }))
  )
  // 後方互換: REFLECTION_ITEMS / PREP_ITEMS は全夜タスクとして扱う
  const REFLECTION_ITEMS = ALL_EVENING_ITEMS
  const PREP_ITEMS: TaskFieldItem[] = []

  const [checkedArr, setCheckedArr] = useDailyStorage<string[]>('evening', 'checked', [], dateKey)
  const [fieldValues, setFieldValues] = useDailyStorage<Record<string, string>>('evening', 'field_values', {}, dateKey)
  const [aiFeedbacks, setAiFeedbacks] = useDailyStorage<Record<string, string>>('evening', 'ai_feedback', {}, dateKey)
  const checked = new Set(checkedArr)
  const [weight, setWeight] = useDailyStorage<string>('evening', 'weight', '', dateKey)
  const [stars, setStars] = useDailyStorage<number>('evening', 'stars', 0, dateKey)
  // Notes（Supabase 永続化）
  const [notes, setNotes] = useState('')
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    loadEveningNotes(dateKey).then(n => {
      if (!cancelled && n !== null) setNotes(n)
    })
    return () => { cancelled = true }
  }, [dateKey])

  const handleNotesChange = (value: string) => {
    setNotes(value)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => {
      void saveEveningNotes(dateKey, value)
    }, 1000)
  }

  // フィードバック（Supabase 永続化）
  const [savedFeedback, setSavedFeedback] = useState('')
  const [streamingFeedback, setStreamingFeedback] = useState('')
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadEveningFeedback(dateKey).then(fb => {
      if (!cancelled && fb) setSavedFeedback(fb)
    })
    return () => { cancelled = true }
  }, [dateKey])
  // 日報保存
  const [, setSavedReport] = useDailyStorage<string>('evening', 'report', '', dateKey)
  const [, setSavedReportAt] = useDailyStorage<string>('evening', 'reportAt', '', dateKey)

  const toggle = (id: string) => {
    if (isReadOnly) return
    setCheckedArr(prev => {
      const s = new Set(prev)
      if (s.has(id)) { s.delete(id) } else { s.add(id) }
      return Array.from(s)
    })
  }

  const isItemDone = (item: TaskFieldItem) => {
    const ft = item.field_type ?? 'checkbox'
    if (ft === 'checkbox') return checkedArr.includes(item.id)
    return Boolean(fieldValues[item.id])
  }

  const allItems = [...REFLECTION_ITEMS, ...PREP_ITEMS]
  const total = allItems.length
  const done = allItems.filter(isItemDone).length

  const generateReport = async () => {
    if (feedbackLoading) return
    if (!checkRateLimit('evening-feedback', 30_000)) {
      setFeedbackError('少し間をおいてから再度お試しください。')
      return
    }

    const reflectionLines = REFLECTION_ITEMS.map(
      i => `${checked.has(i.id) ? '✅' : '⬜'} ${i.label}`
    ).join('\n')
    const reflectionDone = REFLECTION_ITEMS.filter(i => checked.has(i.id)).length

    const text = [
      `# Evening report — ${formatDate()}`,
      '',
      `## Reflection tasks (${reflectionDone}/${REFLECTION_ITEMS.length})`,
      reflectionLines,
      '',
      `## Daily condition`,
      `${starStr(stars)}（${stars}/5）`,
      weight ? `体重（夜）: ${weight} kg` : '体重（夜）: 未記録',
      '',
      notes ? `## Notes\n${notes}` : '',
      bossProp ? `## Primary target\n${bossProp}` : '',
      '',
      '---',
      '今日1日の振り返りと明日へのアドバイスをお願いします。プライマリーターゲットが達成されたかどうかも、notesの内容を踏まえて評価してください。',
    ].filter(Boolean).join('\n')

    const nowStr = () => {
      const d = new Date()
      return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    const reportKey = `daily:${dateKey}:evening:report`
    const reportAtKey = `daily:${dateKey}:evening:reportAt`
    localStorage.setItem(reportKey, JSON.stringify(text))
    localStorage.setItem(reportAtKey, JSON.stringify(nowStr()))
    window.dispatchEvent(new CustomEvent('local-storage', { detail: { key: reportKey } }))
    window.dispatchEvent(new CustomEvent('local-storage', { detail: { key: reportAtKey } }))
    setSavedReport(text)
    setSavedReportAt(nowStr())
    onGenerateReport?.(text)

    // フィードバックをストリーミング
    setFeedbackLoading(true)
    setStreamingFeedback('')
    setFeedbackError(null)
    setSavedFeedback('')
    try {
      await streamEveningFeedback(
        notes,
        bossProp ?? null,
        done,
        total,
        (accumulated) => setStreamingFeedback(accumulated),
        (full) => {
          setSavedFeedback(full)
          setStreamingFeedback('')
          setFeedbackLoading(false)
          void saveEveningFeedback(dateKey, full)
          // バックグラウンドでメモリ更新（ノンブロッキング）
          void (async () => {
            const patch = await extractMemoryPatch(full, userCtx)
            if (patch && Object.keys(patch).length > 0) {
              const merged = mergeContextPatch(userCtx, patch)
              if (Object.keys(merged).length > 0) await updateUserCtx(merged)
            }
          })()
          onComplete?.()
        },
      )
    } catch {
      setFeedbackError('フィードバックの取得に失敗しました。')
      setFeedbackLoading(false)
    }
  }

  // F-12: Evening プログレスバー用集計
  const eveningProgressTotal = allItems.length + 1 // タスク + Notes
  const eveningProgressDone = done + (notes.trim() ? 1 : 0)
  const eveningProgressPct = eveningProgressTotal > 0
    ? Math.round((eveningProgressDone / eveningProgressTotal) * 100)
    : 0

  return (
    <div className={['pb-6', isReadOnly ? 'select-none' : ''].join(' ')}>
      {isReadOnly && (
        <div className="mx-4 mb-1 mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-white/38">Read only record</span>
        </div>
      )}

      {/* F-12: Evening プログレスバー */}
      {!isReadOnly && (
        <div className="mx-4 mt-3 mb-1 flex items-center gap-2">
          <div className="relative flex-1 h-[2px] rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
              style={{ width: `${eveningProgressPct}%`, backgroundColor: '#a78bfa' }}
            />
          </div>
          <span className="text-[10px] text-white/40 tabular-nums">{eveningProgressDone} / {eveningProgressTotal}</span>
        </div>
      )}

      <div className={['mt-4', isReadOnly ? 'pointer-events-none' : ''].join(' ')}>
        {HABIT_CATEGORIES.map(cat => {
          const catItems: TaskFieldItem[] = eveningGrouped[cat.id].map(item => ({
            id: item.id, label: item.label, minutes: item.minutes,
            field_type: item.field_type, field_options: item.field_options,
          }))
          if (catItems.length === 0) return null
          return (
            <div key={cat.id}>
              <div className="flex items-center justify-between px-4 py-2" style={{ borderLeft: `2px solid ${cat.accent}` }}>
                <span className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: cat.accent }}>
                  {cat.label} — {cat.desc}
                </span>
              </div>
              <div className="border-y border-white/[0.05] bg-[#111827]/70">
                {catItems.map(item => (
                  <TaskFieldRow
                    key={item.id}
                    item={item}
                    checked={checkedArr.includes(item.id)}
                    onToggle={() => toggle(item.id)}
                    value={fieldValues[item.id] ?? ''}
                    onChange={v => setFieldValues({ ...fieldValues, [item.id]: v })}
                    aiFeedback={aiFeedbacks[item.id]}
                    onAIFeedback={fb => setAiFeedbacks({ ...aiFeedbacks, [item.id]: fb })}
                    isReadOnly={isReadOnly}
                    dotColor={cat.accent}
                  />
                ))}
              </div>
            </div>
          )
        })}
        <div className="border-y border-white/[0.05] bg-[#111827]/70 mt-4">
          <div className="flex items-center gap-3 border-t border-white/[0.05] px-4 py-2.5">
            <span className="w-16 text-xs text-white/40">体重（夜）</span>
            <input type="number" value={weight} onChange={e => setWeight(e.target.value)} step="0.1"
              className="w-20 rounded border border-white/10 bg-[#0b1320] px-2 py-1 text-center text-sm font-mono text-white/85" placeholder="—" />
            <span className="text-xs text-white/40">kg</span>
          </div>
          <div className="flex items-center gap-2 border-t border-white/[0.05] px-4 py-2.5">
            <span className="w-16 text-xs text-white/40">今日の★</span>
            <div className="flex gap-1">
              {[1,2,3,4,5].map(n => (
                <button key={n} type="button" onClick={() => setStars(n)} className={n <= stars ? 'text-[#c4b5fd]' : 'text-white/[0.14]'}>★</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={['mt-4', isReadOnly ? 'pointer-events-none' : ''].join(' ')}>
        <div className="flex items-center justify-between border-l-2 border-[#7dd3fc] px-4 py-2">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[#aee5ff]">Notes</span>
        </div>
        <div className="border-y border-white/[0.05] bg-[#111827]/70 px-4 py-3">
          <textarea
            value={notes}
            onChange={e => handleNotesChange(e.target.value)}
            placeholder={"Gap・気づき・翌日の予定など、なんでも..."}
            rows={8}
            className="w-full resize-none rounded border border-white/10 bg-[#0b1320] px-3 py-2.5 text-sm text-white/80 placeholder-white/20 focus:border-white/20 focus:outline-none"
          />
        </div>
      </div>

      {/* フィードバック表示 */}
      {(streamingFeedback || savedFeedback) && (
        <div className="mt-4">
          <div className="flex items-center border-l-2 border-[#c4b5fd]/60 px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ddd6fe]/70">Feedback</span>
          </div>
          <div className="border-y border-white/[0.05] bg-[#111827]/70 px-4 py-4">
            <p className="text-sm leading-relaxed text-white/82 whitespace-pre-wrap">
              {streamingFeedback || savedFeedback}
              {feedbackLoading && (
                <span className="ml-0.5 inline-block h-[1em] w-2 animate-pulse bg-[#c4b5fd]/70 align-middle" />
              )}
            </p>
          </div>
        </div>
      )}

      {feedbackError && (
        <p className="mx-4 mt-2 text-xs text-[#fecaca]">{feedbackError}</p>
      )}

      <div className="mx-4 mt-4 flex items-center justify-between">
        <span className="text-xs text-white/36">
          {isReadOnly ? 'Record' : 'Completion rate'}{' '}
          <span className="font-mono text-white">{done} / {total}</span>
        </span>
        {!isReadOnly && (
          <button
            type="button"
            onClick={() => { void generateReport() }}
            disabled={feedbackLoading}
            className="ai-btn-generate flex items-center gap-2 rounded-full border border-[#c4b5fd]/45 bg-gradient-to-r from-[#a78bfa]/15 to-[#7dd3fc]/15 px-6 py-2.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#ddd6fe] disabled:opacity-40"
          >
            <AiMark size={11} />
            {feedbackLoading ? 'Generating…' : savedFeedback ? 'Regenerate' : 'Generate report'}
          </button>
        )}
      </div>
    </div>
  )
}
