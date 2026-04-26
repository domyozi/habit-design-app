import { useState, useEffect, useRef } from 'react'
import { useDailyStorage, todayKey } from '@/lib/storage'
import { bySection, useTodoDefinitions, createTodoId } from '@/lib/todos'
import { streamJournalBrief, extractJsonBlock, stripJsonBlock, checkRateLimit, type JournalBriefResult } from '@/lib/ai'
import { getHabits, logHabit, type HabitItem } from '@/lib/api'

// ─── 型 ───────────────────────────────────────────────────────
interface CheckItem {
  id: string
  label: string
  isMust?: boolean
  minutes?: number
  streak?: number
  monthCount?: number
  monthTarget?: number
}

interface WeightInputProps {
  value: string
  target: number
  onChange: (v: string) => void
  slot: 'morning'
}

interface StarRatingProps {
  value: number
  onChange: (v: number) => void
  label: string
}

// ─── サブコンポーネント ─────────────────────────────────────────

const WeightInput = ({ value, target, onChange }: WeightInputProps) => (
  <div className="flex items-center gap-3 border-t border-white/[0.05] px-4 py-2.5">
    <span className="w-8 text-xs text-white/40">体重</span>
    <input
      type="number"
      value={value}
      onChange={e => onChange(e.target.value)}
      step="0.1"
      className="w-20 rounded border border-white/10 bg-[#0b1320] px-2 py-1 text-center text-sm font-mono text-white/85"
      placeholder="—"
    />
    <span className="text-xs text-white/40">kg</span>
    <span className="ml-auto text-xs text-white/28">目標 {target} kg</span>
  </div>
)

const StarRating = ({ value, onChange, label }: StarRatingProps) => (
  <div className="flex items-center gap-2 border-t border-white/[0.05] px-4 py-2.5">
    <span className="w-20 text-xs text-white/40">{label}</span>
    <div className="flex gap-1">
      {[1,2,3,4,5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={n <= value ? 'text-[#7dd3fc]' : 'text-white/[0.14]'}
        >
          ★
        </button>
      ))}
    </div>
  </div>
)

const CheckRow = ({
  item,
  checked,
  onToggle,
}: {
  item: CheckItem
  checked: boolean
  onToggle: () => void
}) => {
  const prevChecked = useRef(checked)
  const [justChecked, setJustChecked] = useState(false)

  useEffect(() => {
    if (!prevChecked.current && checked) {
      setJustChecked(true)
      const t = setTimeout(() => setJustChecked(false), 700)
      return () => clearTimeout(t)
    }
    prevChecked.current = checked
  }, [checked])

  return (
    <div
      className={[
        'flex items-center gap-3 border-t border-white/[0.05] px-4 py-3 transition-all duration-300',
        checked ? 'opacity-50' : '',
      ].join(' ')}
      style={justChecked ? { animation: 'row-glow 0.7s ease-out forwards' } : undefined}
    >
      <button
        type="button"
        onClick={onToggle}
        data-testid={`morning-check-${item.id}`}
        className={[
          'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-all duration-200 active:scale-90',
          checked
            ? 'border-[#7dd3fc] bg-[#7dd3fc]'
            : 'border-white/20 hover:border-white/40',
        ].join(' ')}
      >
        {checked && (
          <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}
            style={{ animation: 'check-pop 0.25s ease-out' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      <span className={['flex-1 text-sm transition-all duration-300', checked ? 'text-white/28 line-through' : 'text-white/82'].join(' ')}>
        {item.label}
      </span>

      <div className="flex flex-shrink-0 items-center gap-2">
        {item.isMust && (
          <span className="rounded-full border border-[#7dd3fc]/25 bg-[#7dd3fc]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#aee5ff]">
            MUST
          </span>
        )}
        {item.streak != null && item.streak > 0 && (
          <span className="text-[11px] text-white/32">{item.streak} days</span>
        )}
        {item.monthCount != null && item.monthTarget != null && (
          <span className="text-[11px] font-mono text-white/32">{item.monthCount}/{item.monthTarget}</span>
        )}
        {item.minutes && (
          <span className="text-[11px] text-white/24">{item.minutes}m</span>
        )}
      </div>
    </div>
  )
}

const TaskTabButton = ({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  onClick: () => void
}) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      'rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors',
      active
        ? 'border-[#7dd3fc]/30 bg-[#7dd3fc]/12 text-[#aee5ff]'
        : 'border-white/10 bg-white/[0.03] text-white/42 hover:border-white/20 hover:text-white/70',
    ].join(' ')}
  >
    {label} <span className="font-mono">{count}</span>
  </button>
)

// ─── メインコンポーネント ─────────────────────────────────────

const formatDate = () => {
  const d = new Date()
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）`
}

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)

export const MorningTab = ({
  boss,
  bossCompleted,
  onBossToggle,
  onBossSet,
  onGenerateReport,
  viewDate,
}: {
  boss?: string | null
  bossCompleted?: boolean
  onBossToggle?: () => void
  onBossSet?: (value: string) => void
  onGenerateReport?: (text: string) => void
  viewDate?: string
}) => {
  const dateKey = viewDate ?? todayKey()
  const isReadOnly = dateKey !== todayKey()
  const [todoDefinitions, setTodoDefinitions] = useTodoDefinitions()
  const [briefLoading, setBriefLoading] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [brief, setBrief] = useState<JournalBriefResult | null>(null)
  const [briefError, setBriefError] = useState<string | null>(null)
  const [editingBoss, setEditingBoss] = useState(false)
  const [editBossText, setEditBossText] = useState('')
  const MUST_ITEMS: CheckItem[] = bySection(todoDefinitions, 'morning-must').map(item => ({
    id: item.id,
    label: item.label,
    isMust: item.isMust,
    minutes: item.minutes,
  }))
  const ROUTINE_ITEMS: CheckItem[] = bySection(todoDefinitions, 'morning-routine').map(item => ({
    id: item.id,
    label: item.label,
    minutes: item.minutes,
  }))
  const visibleIds = new Set([...MUST_ITEMS, ...ROUTINE_ITEMS].map(item => item.id))

  const [checkedArr, setCheckedArr] = useDailyStorage<string[]>('morning', 'checked', [], dateKey)
  const checked = new Set(checkedArr)
  const setChecked = (fn: (prev: Set<string>) => Set<string>) => {
    if (isReadOnly) return
    setCheckedArr(prev => Array.from(fn(new Set(prev))))
  }
  const [weight, setWeight] = useDailyStorage<string>('morning', 'weight', '', dateKey)
  const [condition, setCondition] = useDailyStorage<number>('morning', 'condition', 0, dateKey)
  const [journal, setJournal] = useDailyStorage<string>('morning', 'journal', '', dateKey)
  const [, setSavedReport] = useDailyStorage<string>('morning', 'report', '', dateKey)
  const [, setSavedReportAt] = useDailyStorage<string>('morning', 'reportAt', '', dateKey)
  const [activeTaskTab, setActiveTaskTab] = useDailyStorage<'core' | 'routine' | 'state'>('morning', 'task-tab', 'core', dateKey)
  const [dbHabits, setDbHabits] = useState<HabitItem[]>([])
  const [habitChecked, setHabitChecked] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (isReadOnly) return
    getHabits().then(habits => {
      setDbHabits(habits)
      const completedIds = habits
        .filter(h => h.today_log?.completed)
        .map(h => h.id)
      setHabitChecked(new Set(completedIds))
    }).catch(() => { /* silently ignore if not authenticated */ })
  }, [isReadOnly])

  const toggleHabit = async (habit: HabitItem) => {
    if (isReadOnly) return
    const wasChecked = habitChecked.has(habit.id)
    setHabitChecked(prev => {
      const next = new Set(prev)
      wasChecked ? next.delete(habit.id) : next.add(habit.id)
      return next
    })
    await logHabit(habit.id, !wasChecked).catch(() => {
      // revert on error
      setHabitChecked(prev => {
        const next = new Set(prev)
        wasChecked ? next.add(habit.id) : next.delete(habit.id)
        return next
      })
    })
  }

  const toggle = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const total = MUST_ITEMS.length + ROUTINE_ITEMS.length
  const done = checkedArr.filter(id => visibleIds.has(id)).length

  const existingLabels = [...MUST_ITEMS, ...ROUTINE_ITEMS].map(i => i.label)

  const handleGenerateBrief = async () => {
    if (!journal.trim() || briefLoading) return
    if (!checkRateLimit('morning-journal-brief', 30_000)) {
      setBriefError('少し間をおいてから再度お試しください。')
      return
    }
    setBriefLoading(true)
    setBriefError(null)
    setStreamingText('')
    setBrief(null)
    try {
      await streamJournalBrief(
        journal,
        { currentGoal: boss ?? null, identity: '', existingTaskLabels: existingLabels },
        (accumulated) => setStreamingText(accumulated),
        (fullText) => {
          const result = extractJsonBlock<JournalBriefResult>(fullText)
          if (result) {
            setBrief(result)
            setStreamingText('')
          } else {
            setBriefError('解析に失敗しました。もう一度お試しください。')
          }
          setBriefLoading(false)
        },
      )
    } catch (e) {
      setBriefError(e instanceof Error ? e.message : 'API呼び出しに失敗しました。')
      setBriefLoading(false)
    }
  }

  const handleApplyBriefTasks = (tasks: JournalBriefResult['tasks']) => {
    const existingSet = new Set(existingLabels.map(l => l.toLowerCase()))
    setTodoDefinitions(prev => {
      const newTasks = tasks
        .filter(t => !existingSet.has(t.label.toLowerCase()))
        .map(t => ({ id: createTodoId(t.label), label: t.label, section: t.section, is_active: true }))
      return [...prev, ...newTasks]
    })
  }

  const handleBossEditSave = () => {
    if (editBossText.trim()) onBossSet?.(editBossText.trim())
    setEditingBoss(false)
  }

  const generateReport = () => {
    const mustLines = MUST_ITEMS.map(
      i => `${checked.has(i.id) ? '✅' : '⬜'} ${i.label}`
    ).join('\n')
    const routineLines = ROUTINE_ITEMS.map(
      i => `${checked.has(i.id) ? '✅' : '⬜'} ${i.label}`
    ).join('\n')
    const mustDone = MUST_ITEMS.filter(i => checked.has(i.id)).length
    const routineDone = ROUTINE_ITEMS.filter(i => checked.has(i.id)).length

    const text = [
      `# Morning report — ${formatDate()}`,
      '',
      journal.trim() ? `## Journal\n${journal.trim()}` : '',
      journal.trim() ? '' : '',
      `## Primary target`,
      boss ? boss : '（未設定）',
      '',
      `## Core tasks (${mustDone}/${MUST_ITEMS.length})`,
      mustLines,
      '',
      `## Routine tasks (${routineDone}/${ROUTINE_ITEMS.length})`,
      routineLines,
      '',
      `## Condition`,
      `${stars(condition)}（${condition}/5）`,
      weight ? `体重: ${weight} kg` : '体重: 未記録',
      '',
      `## Completion rate`,
      `${done} / ${total} 完了（${Math.round((done / total) * 100)}%）`,
      '',
      '---',
      '今日の振り返りをお願いします。',
    ].join('\n')

    const nowStr = () => {
      const d = new Date()
      return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    const reportKey = `daily:${dateKey}:morning:report`
    const reportAtKey = `daily:${dateKey}:morning:reportAt`
    localStorage.setItem(reportKey, JSON.stringify(text))
    localStorage.setItem(reportAtKey, JSON.stringify(nowStr()))
    window.dispatchEvent(new CustomEvent('local-storage', { detail: { key: reportKey } }))
    window.dispatchEvent(new CustomEvent('local-storage', { detail: { key: reportAtKey } }))
    setSavedReport(text)
    setSavedReportAt(nowStr())
    onGenerateReport?.(text)
  }

  return (
    <div className={['pb-6', isReadOnly ? 'select-none' : ''].join(' ')}>
      {isReadOnly && (
        <div className="mx-4 mb-1 mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-white/38">Read only record</span>
        </div>
      )}

      <div
        className={[
          'mx-4 mb-4 mt-4 rounded-2xl border px-4 py-4',
          bossCompleted
            ? 'border-[#34d399]/30 bg-[#34d399]/6'
            : boss
              ? 'border-[#7dd3fc]/20 bg-[#7dd3fc]/5'
              : 'border-white/[0.08] bg-white/[0.02]',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className={['text-[10px] font-semibold uppercase tracking-[0.24em]', bossCompleted ? 'text-[#7ef0be]' : 'text-[#aee5ff]'].join(' ')}>
            {bossCompleted ? 'Primary target closed' : 'Primary target'}
          </span>
          {!isReadOnly && (
            <div className="flex items-center gap-2">
              {boss && !editingBoss && (
                <button
                  type="button"
                  onClick={onBossToggle}
                  className="text-[10px] uppercase tracking-[0.16em] text-white/30 hover:text-white/55"
                >
                  {bossCompleted ? 'Reopen' : 'Mark complete'}
                </button>
              )}
              {!bossCompleted && (
                <button
                  type="button"
                  onClick={() => { setEditingBoss(true); setEditBossText(boss ?? '') }}
                  className="text-[10px] uppercase tracking-[0.16em] text-[#7dd3fc]/60 hover:text-[#7dd3fc]"
                >
                  {boss ? 'Edit' : 'Set target'}
                </button>
              )}
            </div>
          )}
        </div>
        {editingBoss ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={editBossText}
              onChange={e => setEditBossText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleBossEditSave(); if (e.key === 'Escape') setEditingBoss(false) }}
              autoFocus
              className="flex-1 rounded-xl border border-[#7dd3fc]/30 bg-[#0b1320] px-3 py-2 text-sm text-white/88 outline-none"
              placeholder="今日の最重要タスクを入力..."
            />
            <button type="button" onClick={handleBossEditSave} className="rounded-full border border-[#7dd3fc]/30 bg-[#7dd3fc]/12 px-3 py-1.5 text-[11px] font-semibold text-[#aee5ff]">Save</button>
            <button type="button" onClick={() => setEditingBoss(false)} className="text-[11px] text-white/35 hover:text-white/55">Cancel</button>
          </div>
        ) : boss ? (
          <p className={['text-sm font-medium', bossCompleted ? 'text-white/38 line-through' : 'text-white/88'].join(' ')}>{boss}</p>
        ) : (
          <p className="text-sm italic text-white/42">今日の最重要タスクを設定してください。</p>
        )}
      </div>

      <div className="mx-4 mt-4 rounded-[28px] border border-white/[0.08] bg-[#0b1320]/92 px-4 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8ed8ff]">Morning journal</p>
            <p className="mt-2 text-lg font-semibold text-white">朝の思考を書き殴るためのスペースです。</p>
            <p className="mt-1 text-sm text-white/52">今日の宣言、気分、懸念、やることを自由にまとめてください。</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Journal</p>
            <p className="mt-1 text-xl font-semibold text-white">open</p>
          </div>
        </div>
        <div className="relative mt-4">
          <textarea
            value={journal}
            onChange={e => setJournal(e.target.value)}
            maxLength={3000}
            placeholder="例:
・今日は英語学習を最優先にする
・午前中に資料を仕上げる
・気になっていることを先に片づける
・昼までに頭を軽くしておく"
            rows={14}
            className="min-h-[320px] w-full resize-y rounded-[24px] border border-white/10 bg-[#08101a] px-4 py-4 text-[15px] leading-7 text-white/88 placeholder-white/18 shadow-inner outline-none transition-colors focus:border-[#7dd3fc]/30"
          />
          <span className={['absolute bottom-3 left-4 text-[10px]', journal.length > 2700 ? 'text-[#fecaca]' : 'text-white/20'].join(' ')}>
            {journal.length}/3000
          </span>
          {journal.trim().length > 20 && (
            <div
              className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-[#34d399]/25 bg-[#34d399]/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7ef0be]"
              style={{ animation: 'journal-done 0.3s ease-out' }}
            >
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
              </svg>
              Recorded
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-white/34">自由記述はそのまま日報やAI要約の元データになります。</p>
          <div className="flex items-center gap-2">
            {!isReadOnly && journal.trim() && (
              <button
                type="button"
                onClick={handleGenerateBrief}
                disabled={briefLoading}
                className="rounded-full border border-[#7dd3fc]/30 bg-[#7dd3fc]/12 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#aee5ff] disabled:opacity-40"
              >
                {briefLoading ? 'Generating…' : brief ? 'Regenerate' : 'Generate →'}
              </button>
            )}
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => setJournal('')}
                className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40 hover:text-white/72"
              >
                Clear journal
              </button>
            )}
          </div>
        </div>

        {briefError && (
          <p className="mt-3 text-xs text-[#fecaca]">{briefError}</p>
        )}

        {streamingText && !brief && (
          <div className="mt-4 rounded-2xl border border-[#7dd3fc]/15 bg-[#05111e] px-4 py-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8ed8ff]/60">AI が分析中…</p>
            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-white/70">
              {stripJsonBlock(streamingText)}
              <span className="ml-0.5 inline-block h-[1em] w-2 animate-pulse bg-[#7dd3fc]/70 align-middle" />
            </div>
          </div>
        )}

        {brief && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {/* Feedback */}
            <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Feedback</p>
              <p className="mt-2 text-sm leading-relaxed text-white/72">{brief.feedback}</p>
            </div>

            {/* Primary target */}
            <div className="rounded-2xl border border-[#7dd3fc]/18 bg-[#7dd3fc]/5 px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8ed8ff]">Primary target</p>
                <button
                  type="button"
                  onClick={() => onBossSet?.(brief.primary_target)}
                  className="shrink-0 rounded-full border border-[#7dd3fc]/30 bg-[#7dd3fc]/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#aee5ff]"
                >
                  Apply
                </button>
              </div>
              <p className="mt-2 text-sm font-semibold text-white">{brief.primary_target}</p>
              {boss && <p className="mt-2 text-[11px] text-white/32">現在: {boss}</p>}
            </div>

            {/* Tasks */}
            <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Tasks ({brief.tasks.length})</p>
                {brief.tasks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleApplyBriefTasks(brief.tasks)}
                    className="shrink-0 rounded-full border border-[#34d399]/25 bg-[#34d399]/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7ef0be]"
                  >
                    Apply all
                  </button>
                )}
              </div>
              <div className="mt-2 space-y-1.5">
                {brief.tasks.length === 0 && <p className="text-xs text-white/32">新規タスクなし</p>}
                {brief.tasks.map((task, i) => {
                  const isDupe = existingLabels.some(l => l.toLowerCase() === task.label.toLowerCase())
                  return (
                    <div key={`${task.label}-${i}`} className={['rounded-xl border px-2.5 py-2', isDupe ? 'border-white/[0.04] opacity-40' : 'border-white/[0.06] bg-[#09111c]'].join(' ')}>
                      <div className="flex items-center gap-1.5">
                        <span className={['text-[10px] rounded px-1 py-0.5 font-semibold uppercase', task.section === 'morning-must' ? 'bg-[#ff6b35]/12 text-[#ff9966]' : 'bg-[#f59e0b]/10 text-[#fbd38d]'].join(' ')}>
                          {task.section === 'morning-must' ? 'must' : 'routine'}
                        </span>
                        <p className="text-xs text-white/80">{task.label}</p>
                        {isDupe && <span className="ml-auto text-[10px] text-white/30">既存</span>}
                      </div>
                      <p className="mt-1 text-[11px] text-white/36">{task.reason}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mx-4 mt-4 rounded-[28px] border border-white/[0.08] bg-[#0b1320]/90 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <TaskTabButton active={activeTaskTab === 'core'} label="Core tasks" count={MUST_ITEMS.length} onClick={() => setActiveTaskTab('core')} />
          <TaskTabButton active={activeTaskTab === 'routine'} label="Routine tasks" count={ROUTINE_ITEMS.length} onClick={() => setActiveTaskTab('routine')} />
          <TaskTabButton active={activeTaskTab === 'state'} label="State" count={2} onClick={() => setActiveTaskTab('state')} />
        </div>

        <div className={['mt-4', isReadOnly ? 'pointer-events-none' : ''].join(' ')}>
          {activeTaskTab === 'core' && (
            <Section title="Core tasks" time="05:00–06:30" color="must">
              {MUST_ITEMS.map(item => (
                <CheckRow key={item.id} item={item} checked={checked.has(item.id)} onToggle={() => toggle(item.id)} />
              ))}
            </Section>
          )}

          {activeTaskTab === 'routine' && (
            <Section title="Preparation sequence" time="06:30–07:30" color="routine">
              {ROUTINE_ITEMS.map(item => (
                <CheckRow key={item.id} item={item} checked={checked.has(item.id)} onToggle={() => toggle(item.id)} />
              ))}
            </Section>
          )}

          {activeTaskTab === 'state' && (
            <div className="space-y-3">
              <WeightInput value={weight} target={72.9} onChange={setWeight} slot="morning" />
              <StarRating value={condition} onChange={setCondition} label="コンディション" />
            </div>
          )}
        </div>
      </div>

      {!isReadOnly && (
        <div className="mx-4 mt-4 rounded-[28px] border border-white/[0.08] bg-[#0b1320]/90 px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8da4c3]">My habits</p>
          {dbHabits.length === 0 ? (
            <p className="mt-3 text-xs text-white/38">
              マンダラチャートから習慣を追加すると、ここに表示されます。
            </p>
          ) : (
            <div className="mt-3 border-y border-white/[0.05] bg-[#111827]/70">
              {dbHabits.map(habit => {
                const isChecked = habitChecked.has(habit.id)
                return (
                  <div
                    key={habit.id}
                    className={['flex items-center gap-3 border-t border-white/[0.05] px-4 py-3 transition-all duration-300', isChecked ? 'opacity-50' : ''].join(' ')}
                  >
                    <button
                      type="button"
                      onClick={() => toggleHabit(habit)}
                      className={[
                        'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-all duration-200 active:scale-90',
                        isChecked ? 'border-[#7dd3fc] bg-[#7dd3fc]' : 'border-white/20 hover:border-white/40',
                      ].join(' ')}
                    >
                      {isChecked && (
                        <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className={['text-sm transition-all duration-300', isChecked ? 'text-white/28 line-through' : 'text-white/82'].join(' ')}>
                        {habit.title}
                      </span>
                      {habit.wanna_be_connection_text && (
                        <p className="mt-0.5 truncate text-[11px] text-white/28">{habit.wanna_be_connection_text}</p>
                      )}
                    </div>
                    {(habit.current_streak ?? 0) > 0 && (
                      <span className="text-[11px] text-white/32 flex-shrink-0">{habit.current_streak} days</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {done === total && total > 0 && (
        <div className="mx-4 mt-4 rounded-2xl border border-[#34d399]/30 bg-[#34d399]/6 px-4 py-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7ef0be]">Sequence complete</p>
          <p className="mt-1 text-sm font-semibold text-white/86">Morning actions are fully recorded.</p>
          <p className="mt-1 text-[11px] text-white/40">Generate the report when you want an AI summary.</p>
        </div>
      )}

      <div className="mx-4 mt-4 flex items-center justify-between">
        <span className="text-xs text-white/36">
          {isReadOnly ? 'Record' : 'Completion rate'}{' '}
          <span className="font-mono text-white">{done} / {total}</span>
        </span>
        {!isReadOnly && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={generateReport}
              className="rounded-full border border-[#7dd3fc]/30 bg-[#7dd3fc]/12 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#aee5ff]"
            >
              Generate report
            </button>
            <button
              type="button"
              onClick={() => { setCheckedArr([]); setWeight(''); setCondition(0 as number) }}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/38 hover:text-white/72"
            >
              Reset today
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Section ヘルパー ─────────────────────────────────────────
const Section = ({
  title,
  time,
  color,
  children,
}: {
  title: string
  time: string
  color: 'must' | 'routine'
  children: React.ReactNode
}) => (
  <div className="mt-4">
    <div className={[
      'flex items-center justify-between px-4 py-2',
      color === 'must' ? 'border-l-2 border-[#7dd3fc]' : 'border-l-2 border-[#c4b5fd]',
    ].join(' ')}>
      <span className={[
        'text-xs font-semibold uppercase tracking-[0.22em]',
        color === 'must' ? 'text-[#aee5ff]' : 'text-[#ddd6fe]',
      ].join(' ')}>
        {title}
      </span>
      <span className="text-[11px] text-white/24">{time}</span>
    </div>
    <div className="border-y border-white/[0.05] bg-[#111827]/70">
      {children}
    </div>
  </div>
)
