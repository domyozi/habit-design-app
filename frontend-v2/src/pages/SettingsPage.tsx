import { useState, useEffect } from 'react'
import { useLocalStorage } from '@/lib/storage'
import { callClaude } from '@/lib/ai'
import { HABIT_CATEGORIES, bySectionAll, createTodoId, useTodoDefinitions, type TodoDefinition, type HabitCategory, type HabitTiming, type TaskFieldType, type TaskFieldOptions } from '@/lib/todos'
import { AiMark } from '@/components/ui/AiMark'
import { useUserContext } from '@/lib/user-context'
import type { AppLang } from '@/lib/lang'

// AI設定支援で生成される習慣アイテム
interface AiHabitItem {
  id: string
  label: string
  isMust?: boolean
  minutes?: number
}

interface AiHabitSuggestion {
  morning: AiHabitItem[]
  evening?: AiHabitItem[]
  evening_reflection?: AiHabitItem[]
  evening_prep?: AiHabitItem[]
  summary: string
}

// AI会話履歴
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  ts: number
}

const AI_SETUP_SYSTEM = `あなたは習慣設計のコーチです。ユーザーの「なりたい姿」や「やりたいこと」を聞いて、
朝ルーティンと夜ルーティンの習慣リストを提案してください。

提案するときは必ず以下のJSON形式を含めてください（マークダウンコードブロックで囲む）：
\`\`\`json
{
  "morning": [
    { "id": "habit-id", "label": "習慣名", "isMust": true, "minutes": 30 }
  ],
  "evening_reflection": [
    { "id": "habit-id", "label": "習慣名", "minutes": 10 }
  ],
  "evening_prep": [
    { "id": "habit-id", "label": "習慣名", "minutes": 5 }
  ],
  "summary": "提案の要約"
}
\`\`\`

朝は "morning"、夜は必ず "evening_reflection"（振り返り・記録）と "evening_prep"（翌日の準備）に分けてください。
古い形式との互換のため "evening" を返してもよいが、優先は "evening_reflection" と "evening_prep"。
習慣IDは英小文字とハイフンのみ使用。isMustはその習慣が核心的かどうか（省略可、デフォルトfalse）。
minutesは所要時間（分）、省略可。`

const parseAiHabits = (text: string): AiHabitSuggestion | null => {
  try {
    const match = /```json\s*([\s\S]*?)\s*```/.exec(text)
    if (!match) return null
    return JSON.parse(match[1]) as AiHabitSuggestion
  } catch {
    return null
  }
}

const normalizeLabel = (label: string) => label.trim().toLowerCase()

const getEveningReflectionItems = (suggestion: AiHabitSuggestion) =>
  suggestion.evening_reflection ?? suggestion.evening ?? []

const getEveningPrepItems = (suggestion: AiHabitSuggestion) =>
  suggestion.evening_prep ?? []

const mergeAiSuggestionIntoTodos = (
  currentTodos: TodoDefinition[],
  suggestion: AiHabitSuggestion
): TodoDefinition[] => {
  const nextTodos = [...currentTodos]
  const exists = new Set(
    currentTodos.map(todo => `${todo.section}:${normalizeLabel(todo.label)}`)
  )

  const appendTodo = (
    item: AiHabitItem,
    section: HabitCategory,
    timing: HabitTiming,
    isMust = false
  ) => {
    const dedupeKey = `${section}:${normalizeLabel(item.label)}`
    if (!item.label.trim() || exists.has(dedupeKey)) return

    exists.add(dedupeKey)
    nextTodos.push({
      id: createTodoId(item.label),
      label: item.label.trim(),
      section,
      timing,
      minutes: item.minutes,
      isMust,
      is_active: true,
    })
  }

  suggestion.morning.forEach(item => {
    appendTodo(item, item.isMust ? 'identity' : 'system', 'morning', Boolean(item.isMust))
  })
  getEveningReflectionItems(suggestion).forEach(item => {
    appendTodo(item, 'system', 'evening')
  })
  getEveningPrepItems(suggestion).forEach(item => {
    appendTodo(item, 'system', 'evening')
  })

  return nextTodos
}

const replaceSectionsFromAiSuggestion = (
  currentTodos: TodoDefinition[],
  suggestion: AiHabitSuggestion
): TodoDefinition[] => {
  const replaceTargets: HabitCategory[] = ['identity', 'growth', 'body', 'mind', 'system']
  const preserved = currentTodos.map(todo =>
    replaceTargets.includes(todo.section as HabitCategory) ? { ...todo, is_active: false } : todo
  )
  return mergeAiSuggestionIntoTodos(preserved, suggestion)
}

// ─── AI設定支援チャット ─────────────────────────────────────

const AiSetupChat = () => {
  const [history, setHistory] = useLocalStorage<ChatMessage[]>('settings:ai:context', [])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestion, setSuggestion] = useState<AiHabitSuggestion | null>(null)
  const [savedAiHabits, setAiHabits] = useLocalStorage<AiHabitSuggestion | null>('settings:ai:habits', null)
  const [, setTodos] = useTodoDefinitions()
  const [saved, setSaved] = useState(false)
  const [applied, setApplied] = useState(false)
  const [applyMode, setApplyMode] = useState<'append' | 'replace'>('append')

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), ts: Date.now() }
    const newHistory = [...history.slice(-18), userMsg]
    setHistory(newHistory)
    setInput('')
    setLoading(true)
    setSuggestion(null)
    setSaved(false)
    setApplied(false)
    setApplyMode('append')

    try {
      const messages = newHistory.map(m => ({ role: m.role, content: m.content }))
      const reply = await callClaude(messages, AI_SETUP_SYSTEM, 1024)
      const assistantMsg: ChatMessage = { role: 'assistant', content: reply, ts: Date.now() }
      setHistory(prev => [...prev.slice(-18), assistantMsg])

      const parsed = parseAiHabits(reply)
      if (parsed) setSuggestion(parsed)
    } catch {
      const errMsg: ChatMessage = {
        role: 'assistant',
        content: 'エラーが発生しました。ログイン状態またはサーバー側のAI設定を確認してください。',
        ts: Date.now(),
      }
      setHistory(prev => [...prev, errMsg])
    } finally {
      setLoading(false)
    }
  }

  const handleSave = () => {
    if (!suggestion) return
    setAiHabits(suggestion)
    setSaved(true)
    setApplied(false)
  }

  const handleApplyToTodos = () => {
    const source = suggestion ?? savedAiHabits
    if (!source) return

    // F-08: confirm before replacing all habits
    if (applyMode === 'replace') {
      const ok = window.confirm('既存の習慣がすべて置き換えられます。続けますか？')
      if (!ok) return
    }

    setTodos(prev => (
      applyMode === 'replace'
        ? replaceSectionsFromAiSuggestion(prev, source)
        : mergeAiSuggestionIntoTodos(prev, source)
    ))
    setApplied(true)
  }

  const clearHistory = () => {
    setHistory([])
    setSuggestion(null)
    setSaved(false)
  }

  return (
    <div className="space-y-3">
      {history.length > 0 && (
        <div className="max-h-60 space-y-2 overflow-y-auto">
          {history.map((msg, i) => (
            <div key={i} className={['rounded-2xl px-3 py-2 text-xs', msg.role === 'user'
              ? 'bg-[#162131] text-white/80 text-right'
              : 'bg-[#0b1320] text-white/70 border border-white/[0.06]'].join(' ')}>
              {msg.role === 'assistant' ? (
                <span className="whitespace-pre-wrap">
                  {msg.content.replace(/```json[\s\S]*?```/g, '').trim()}
                </span>
              ) : (
                msg.content
              )}
            </div>
          ))}
          {loading && (
            <div className="rounded-2xl border border-white/[0.06] bg-[#0b1320] px-3 py-2 text-xs uppercase tracking-[0.16em] text-white/35">Generating</div>
          )}
        </div>
      )}

      {suggestion && (
        <div className="space-y-3 rounded-2xl border border-[#38bdf8]/20 bg-[#0f1726]/88 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8ed8ff]">AI suggestion</p>
          {suggestion.morning.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Morning</p>
              {suggestion.morning.map(h => (
                <div key={h.id} className="py-0.5 text-xs text-white/70">
                  {h.isMust ? '[core] ' : ''}{h.label}{h.minutes ? ` (${h.minutes}m)` : ''}
                </div>
              ))}
            </div>
          )}
          {getEveningReflectionItems(suggestion).length > 0 && (
            <div>
              <p className="mb-1 mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Evening reflection</p>
              {getEveningReflectionItems(suggestion).map(h => (
                <div key={h.id} className="py-0.5 text-xs text-white/70">
                  {h.label}{h.minutes ? ` (${h.minutes}m)` : ''}
                </div>
              ))}
            </div>
          )}
          {getEveningPrepItems(suggestion).length > 0 && (
            <div>
              <p className="mb-1 mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Evening prep</p>
              {getEveningPrepItems(suggestion).map(h => (
                <div key={h.id} className="py-0.5 text-xs text-white/70">
                  {h.label}{h.minutes ? ` (${h.minutes}m)` : ''}
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => setApplyMode('append')}
              className={[
                'rounded-xl border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors',
                applyMode === 'append'
                  ? 'border-[#38bdf8]/40 bg-[#38bdf8]/15 text-[#38bdf8]'
                  : 'border-white/10 text-white/38 hover:text-white',
              ].join(' ')}
            >
              Append
            </button>
            <button
              type="button"
              onClick={() => setApplyMode('replace')}
              className={[
                'rounded-xl border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors',
                applyMode === 'replace'
                  ? 'border-[#f59e0b]/40 bg-[#f59e0b]/15 text-[#f59e0b]'
                  : 'border-white/10 text-white/38 hover:text-white',
              ].join(' ')}
            >
              Replace
            </button>
          </div>
          <p className="text-[10px] text-white/32">
            {applyMode === 'append'
              ? '既存の To Do を残したまま、AI候補を不足分だけ追加します。'
              : '朝/夜の To Do セクションを AI候補で入れ替えます。'}
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={saved}
            className={['mt-2 w-full rounded-full border py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-colors',
              saved
                ? 'bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/30'
                : 'bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/30 hover:bg-[#38bdf8]/30',
            ].join(' ')}>
            {saved ? 'Saved' : 'Save suggestion'}
          </button>
          <button
            type="button"
            onClick={handleApplyToTodos}
            className={['w-full rounded-full border py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-colors',
              applied
                ? 'bg-[#22c55e]/20 text-[#22c55e] border-[#22c55e]/30'
                : 'bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/30 hover:bg-[#f59e0b]/25',
            ].join(' ')}
          >
            {applied ? 'Applied to todos' : applyMode === 'replace' ? 'Replace todo sections' : 'Apply to todos'}
          </button>
        </div>
      )}

      {!suggestion && savedAiHabits && (
        <div className="space-y-2 rounded-2xl border border-white/[0.06] bg-[#0f1726]/88 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">Saved suggestion</p>
          <p className="text-xs text-white/32">
            前回保存したAI候補を、現在の To Do 一覧へまとめて反映できます。
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setApplyMode('append')}
              className={[
                'rounded-xl border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors',
                applyMode === 'append'
                  ? 'border-[#38bdf8]/40 bg-[#38bdf8]/15 text-[#38bdf8]'
                  : 'border-white/10 text-white/38 hover:text-white',
              ].join(' ')}
            >
              Append
            </button>
            <button
              type="button"
              onClick={() => setApplyMode('replace')}
              className={[
                'rounded-xl border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors',
                applyMode === 'replace'
                  ? 'border-[#f59e0b]/40 bg-[#f59e0b]/15 text-[#f59e0b]'
                  : 'border-white/10 text-white/38 hover:text-white',
              ].join(' ')}
            >
              Replace
            </button>
          </div>
          <button
            type="button"
            onClick={handleApplyToTodos}
            className={['w-full rounded-full border py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-colors',
              applied
                ? 'bg-[#22c55e]/20 text-[#22c55e] border-[#22c55e]/30'
                : 'bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/30 hover:bg-[#f59e0b]/25',
            ].join(' ')}
          >
            {applied ? 'Applied to todos' : applyMode === 'replace' ? 'Replace with saved suggestion' : 'Apply saved suggestion'}
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="例: 毎朝5時に起きて筋トレと英語をやりたい..."
          className="flex-1 rounded-2xl border border-white/10 bg-[#0b1320] px-3 py-2 text-sm text-white placeholder-white/20"
          disabled={loading}
        />
        <button
          type="button"
          onClick={send}
          disabled={loading || !input.trim()}
          className="flex items-center gap-1.5 rounded-full border border-[#38bdf8]/30 bg-[#38bdf8]/12 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#8ed8ff] disabled:opacity-30"
        >
          <AiMark />
          Send
        </button>
      </div>

      {history.length > 0 && (
        <button type="button" onClick={clearHistory}
          className="text-[10px] uppercase tracking-[0.16em] text-white/24 hover:text-white/45">
          Reset conversation
        </button>
      )}
    </div>
  )
}

const TodoManager = () => {
  const [todos, setTodos] = useTodoDefinitions()
  const [drafts, setDrafts] = useState<Record<HabitCategory, { label: string; timing: HabitTiming }>>({
    identity: { label: '', timing: 'morning' },
    growth:   { label: '', timing: 'morning' },
    body:     { label: '', timing: 'morning' },
    mind:     { label: '', timing: 'morning' },
    system:   { label: '', timing: 'morning' },
  })
  const [openSection, setOpenSection] = useState<HabitCategory | null>('identity')
  const [addingIn, setAddingIn] = useState<HabitCategory | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  // 編集中アイテム: id → { label, timing }
  const [editing, setEditing] = useState<Record<string, { label: string; timing: HabitTiming }>>({})

  const updateDraft = (section: HabitCategory, key: 'label' | 'timing', value: string) =>
    setDrafts(prev => ({ ...prev, [section]: { ...prev[section], [key]: value } }))

  const addTodo = (section: HabitCategory) => {
    const label = drafts[section].label.trim()
    if (!label) return
    const newTodo: TodoDefinition = {
      id: createTodoId(label),
      label,
      section,
      timing: drafts[section].timing,
      isMust: false,
      is_active: true,
    }
    setTodos(prev => [...prev, newTodo])
    setDrafts(prev => ({ ...prev, [section]: { label: '', timing: 'morning' } }))
    setAddingIn(null)
  }

  const hideTodo = (id: string) =>
    setTodos(prev => prev.map(t => t.id === id ? { ...t, is_active: false } : t))

  const restoreTodo = (id: string) =>
    setTodos(prev => prev.map(t => t.id === id ? { ...t, is_active: true } : t))

  const deleteTodo = (id: string) =>
    setTodos(prev => prev.filter(t => t.id !== id))

  const startEdit = (item: TodoDefinition) =>
    setEditing(prev => ({ ...prev, [item.id]: { label: item.label, timing: item.timing } }))

  const cancelEdit = (id: string) =>
    setEditing(prev => { const n = { ...prev }; delete n[id]; return n })

  const saveEdit = (id: string) => {
    const e = editing[id]
    if (!e?.label.trim()) return
    setTodos(prev => prev.map(t => t.id === id ? { ...t, label: e.label.trim(), timing: e.timing } : t))
    cancelEdit(id)
  }

  const allHidden = todos.filter(t => !t.is_active)

  const timingColor = (timing: HabitTiming) =>
    timing === 'morning' ? '#7dd3fc' : timing === 'evening' ? '#a78bfa' : '#94a3b8'

  const timingLabel = (timing: HabitTiming) =>
    timing === 'morning' ? 'AM' : timing === 'evening' ? 'PM' : '∞'

  return (
    <div className="px-4 py-3 space-y-2">
      {HABIT_CATEGORIES.map(section => {
        const activeItems = bySectionAll(todos, section.id).filter(t => t.is_active)
        const isOpen = openSection === section.id
        const draft = drafts[section.id]
        const isAdding = addingIn === section.id

        return (
          <div
            key={section.id}
            className="overflow-hidden rounded-[20px] border transition-colors"
            style={{ borderColor: isOpen ? `${section.accent}28` : 'rgba(255,255,255,0.05)' }}
          >
            {/* ── カテゴリヘッダー ── */}
            <button
              type="button"
              onClick={() => setOpenSection(isOpen ? null : section.id as HabitCategory)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: section.accent }} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: section.accent }}>
                {section.label}
              </span>
              <span className="text-[10px] text-white/28">{section.desc}</span>
              <div className="ml-auto flex items-center gap-2">
                {activeItems.length > 0 && (
                  <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-mono text-white/30">
                    {activeItems.length}
                  </span>
                )}
                <span className="text-[9px] text-white/20">{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>

            {/* ── 展開エリア ── */}
            {isOpen && (
              <div className="border-t px-3 pb-3 pt-1" style={{ borderColor: `${section.accent}14` }}>

                {/* アイテム一覧 */}
                {activeItems.length > 0 ? (
                  <div className="mb-2 divide-y divide-white/[0.04]">
                    {activeItems.map(item => {
                      const isEditing = Boolean(editing[item.id])
                      const ed = editing[item.id]
                      return (
                        <div key={item.id} className="group py-2.5 px-1">
                          {isEditing ? (
                            /* ── 編集モード ── */
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={ed.label}
                                onChange={e => setEditing(prev => ({ ...prev, [item.id]: { ...prev[item.id], label: e.target.value } }))}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(item.id); if (e.key === 'Escape') cancelEdit(item.id) }}
                                autoFocus
                                className="flex-1 rounded-xl border border-white/[0.12] bg-[#08111c] px-3 py-1.5 text-sm text-white/88 placeholder-white/20 focus:border-white/22 focus:outline-none"
                              />
                              <select
                                value={ed.timing}
                                onChange={e => setEditing(prev => ({ ...prev, [item.id]: { ...prev[item.id], timing: e.target.value as HabitTiming } }))}
                                className="rounded-xl border border-white/[0.08] bg-[#08111c] px-2 py-1.5 text-[11px] text-white/55 focus:outline-none"
                              >
                                <option value="morning">朝</option>
                                <option value="evening">夜</option>
                                <option value="anytime">常時</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => saveEdit(item.id)}
                                className="shrink-0 rounded-xl border px-3 py-1.5 text-[11px] font-semibold"
                                style={{ borderColor: `${section.accent}35`, backgroundColor: `${section.accent}10`, color: section.accent }}
                              >
                                保存
                              </button>
                              <button
                                type="button"
                                onClick={() => cancelEdit(item.id)}
                                className="shrink-0 px-1 text-sm text-white/22 hover:text-white/50"
                              >
                                ×
                              </button>
                            </div>
                          ) : (
                            /* ── 表示モード ── */
                            <div className="flex items-center gap-3">
                              <span
                                className="h-3.5 w-0.5 shrink-0 rounded-full"
                                style={{ backgroundColor: `${timingColor(item.timing)}55` }}
                              />
                              <p className="flex-1 text-sm text-white/72 leading-snug">{item.label}</p>
                              <span
                                className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.14em]"
                                style={{ color: `${timingColor(item.timing)}80` }}
                              >
                                {timingLabel(item.timing)}
                              </span>
                              {/* 編集ボタン（ホバー時） */}
                              <button
                                type="button"
                                onClick={() => startEdit(item)}
                                title="編集"
                                className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-white/50 transition-all hover:bg-white/[0.08] hover:text-white/80"
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                onClick={() => hideTodo(item.id)}
                                title="非表示"
                                className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-white/50 transition-all hover:bg-white/[0.08] hover:text-white/80"
                              >
                                —
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="px-1 py-2 text-[11px] text-white/22">まだ習慣がありません</p>
                )}

                {/* 追加フォーム */}
                {isAdding ? (
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={draft.label}
                      onChange={e => updateDraft(section.id as HabitCategory, 'label', e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') addTodo(section.id as HabitCategory)
                        if (e.key === 'Escape') setAddingIn(null)
                      }}
                      placeholder="習慣名を入力…"
                      autoFocus
                      className="flex-1 rounded-xl border border-white/[0.08] bg-[#08111c] px-3 py-2 text-sm text-white/88 placeholder-white/20 focus:border-white/16 focus:outline-none"
                    />
                    <select
                      value={draft.timing}
                      onChange={e => updateDraft(section.id as HabitCategory, 'timing', e.target.value)}
                      className="rounded-xl border border-white/[0.08] bg-[#08111c] px-2 py-2 text-[11px] text-white/55 focus:outline-none"
                    >
                      <option value="morning">朝</option>
                      <option value="evening">夜</option>
                      <option value="anytime">常時</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => addTodo(section.id as HabitCategory)}
                      disabled={!draft.label.trim()}
                      className="shrink-0 rounded-xl border px-3 py-2 text-[11px] font-semibold disabled:opacity-30"
                      style={{ borderColor: `${section.accent}35`, backgroundColor: `${section.accent}10`, color: section.accent }}
                    >
                      追加
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingIn(null)}
                      className="shrink-0 px-1 text-sm text-white/22 hover:text-white/50"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingIn(section.id as HabitCategory)}
                    className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-white/22 transition-colors hover:bg-white/[0.03] hover:text-white/45"
                  >
                    <span className="text-sm leading-none">+</span>
                    <span className="text-[11px]">習慣を追加</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* ── 非表示アイテム（Restore + 完全削除） ── */}
      {allHidden.length > 0 && (
        <div className="overflow-hidden rounded-[20px] border border-white/[0.04]">
          <button
            type="button"
            onClick={() => setShowHidden(p => !p)}
            className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/22">Hidden</span>
            <span className="text-[10px] font-mono text-white/18">{allHidden.length} {showHidden ? '▲' : '▼'}</span>
          </button>
          {showHidden && (
            <div className="border-t border-white/[0.04] divide-y divide-white/[0.04]">
              {allHidden.map(item => (
                <div key={item.id} className="group flex items-center gap-3 px-4 py-2.5">
                  <p className="flex-1 text-sm text-white/25 line-through leading-snug">{item.label}</p>
                  <button
                    type="button"
                    onClick={() => restoreTodo(item.id)}
                    className="shrink-0 rounded-full border border-white/[0.07] px-2.5 py-1 text-[10px] text-white/30 transition-colors hover:border-white/14 hover:text-white/55"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTodo(item.id)}
                    title="完全削除"
                    className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-white/18 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── SettingsPage ─────────────────────────────────────────────

const ApiKeySettings = () => (
  <div className="rounded-2xl border border-white/[0.06] bg-[#0b1320]/80 px-4 py-4">
    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">AI connection</p>
    <p className="mt-2 text-sm text-white/62">
      Anthropic API Key はサーバー側の環境変数で管理されます。ブラウザや localStorage には保存しません。
    </p>
    <p className="mt-2 text-[11px] text-white/30">
      AI機能には認証済みセッションとバックエンドの ANTHROPIC_API_KEY 設定が必要です。
    </p>
  </div>
)

const GRANULARITY_OPTIONS = [
  { value: 'child', label: 'こども' },
  { value: 'student', label: '学生' },
  { value: 'adult', label: '大人' },
] as const

const ProfileSettings = () => {
  const [ctx, updateCtx] = useUserContext()
  // F-17: use API; fall back to localStorage for backward compat
  const granularity = ctx?.granularity ?? localStorage.getItem('settings:profile:granularity') ?? 'adult'
  const handleChange = (v: string) => {
    localStorage.setItem('settings:profile:granularity', v)
    void updateCtx({ granularity: v })
  }
  return (
    <div className="rounded-[28px] border border-white/[0.06] bg-[#111827]/78 px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#8da4c3]">プロフィール</p>
      <p className="mt-1 text-[11px] text-white/38">マンダラチャートのアクションの難易度・語調が変わります</p>
      <div className="mt-3 flex gap-2">
        {GRANULARITY_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleChange(opt.value)}
            className={[
              'flex-1 rounded-full border py-2 text-xs font-semibold transition-all',
              granularity === opt.value
                ? 'border-[#7dd3fc]/40 bg-[#7dd3fc]/15 text-[#aee5ff]'
                : 'border-white/10 bg-white/[0.02] text-white/42 hover:border-white/25',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── 体重目標設定 ──────────────────────────────────────────────

const WeightTargetSettings = () => {
  const [value, setValue] = useState<string>(
    () => localStorage.getItem('settings:weight-target') ?? '72.9'
  )
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    const num = parseFloat(value)
    if (!isNaN(num) && num > 0) {
      localStorage.setItem('settings:weight-target', String(num))
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    }
  }

  return (
    <div className="rounded-[28px] border border-white/[0.06] bg-[#111827]/78 px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#8da4c3]">体重目標</p>
      <p className="mt-1 text-[11px] text-white/38">Morning Tab の記録タブに表示される目標体重を設定します</p>
      <div className="mt-3 flex items-center gap-2">
        <input
          type="number"
          step="0.1"
          min="30"
          max="200"
          value={value}
          onChange={e => setValue(e.target.value)}
          className="w-24 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-[#7dd3fc]/40"
        />
        <span className="text-sm text-white/50">kg</span>
        <button
          type="button"
          onClick={handleSave}
          className="ml-auto rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/70 transition-all hover:border-white/25 hover:text-white"
        >
          {saved ? '保存済み ✓' : '保存'}
        </button>
      </div>
    </div>
  )
}

// ─── 言語設定 ─────────────────────────────────────────────────

const LangSettings = () => {
  const [ctx, updateCtx] = useUserContext()
  const lang: AppLang = ctx?.lang ?? 'ja'

  const setLang = (next: AppLang) => {
    void updateCtx({ lang: next })
  }

  return (
    <div className="rounded-[28px] border border-white/[0.06] bg-[#111827]/78 px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#8da4c3]">Language / 言語</p>
      <p className="mt-1 text-[11px] text-white/38">ナビゲーションメニューの表示言語を切り替えます</p>
      <div className="mt-3 flex gap-2">
        {([['ja', '日本語'], ['en', 'English']] as [AppLang, string][]).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setLang(val)}
            className={[
              'flex-1 rounded-full border py-2 text-xs font-semibold transition-all',
              lang === val
                ? 'border-[#a78bfa]/40 bg-[#a78bfa]/15 text-[#c4b5fd]'
                : 'border-white/10 bg-white/[0.02] text-white/42 hover:border-white/25',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── AIタスク登録 ──────────────────────────────────────────────

interface AiParsedTask {
  label: string
  section: HabitCategory
  timing?: HabitTiming
  field_type: TaskFieldType
  minutes: number | null
  field_options: TaskFieldOptions | null
  confirmation: string
}

const AI_TASK_PARSE_SYSTEM = `あなたは習慣管理アプリの入力パーサーです。ユーザーが自然言語で説明したタスクを、アプリのデータ形式に変換してください。

必ず以下のJSON形式のみで返答してください（説明文は不要、JSONのみ）：
\`\`\`json
{
  "label": "タスク名（簡潔に）",
  "section": "system",
  "timing": "morning",
  "field_type": "checkbox",
  "minutes": null,
  "field_options": null,
  "confirmation": "こういうことでOKですか？（1〜2文で確認）"
}
\`\`\`

section の判断基準（HabitCategory）:
- アイデンティティに直結する核心習慣 → "identity"
- 成長・学習・副業など → "growth"
- 身体管理（運動・体重・睡眠など） → "body"
- 精神・集中・瞑想など → "mind"
- システム・計画・記録・確認など → "system"

timing の判断基準:
- 朝に行う習慣 → "morning"
- 夜に行う習慣 → "evening"
- いつでもよい → "anytime"

field_type の判断基準:
- 数値を記録（体重・歩数・時間など） → "number"
- 達成率・パーセント → "percent"
- 選択肢から選ぶ → "select"
- テキストで記録（日記・メモ） → "text"
- テキスト＋AIフィードバックが欲しい → "text-ai"
- URLを保存 → "url"
- それ以外（やった/やってない） → "checkbox"

field_options:
- number/percent の場合: { "unit": "kg" } など単位があれば
- select の場合: { "choices": ["選択肢1", "選択肢2"] }
- text/text-ai/url の場合: { "placeholder": "入力例..." } があれば
- それ以外: null`

const AiTaskCreator = () => {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [parsed, setParsed] = useState<AiParsedTask | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState(false)
  const [, setTodos] = useTodoDefinitions()

  const parse = async () => {
    if (!input.trim() || loading) return
    setLoading(true)
    setParsed(null)
    setError(null)
    setAdded(false)

    try {
      const reply = await callClaude(
        [{ role: 'user', content: input.trim() }],
        AI_TASK_PARSE_SYSTEM,
        512
      )
      const match = /```json\s*([\s\S]*?)\s*```/.exec(reply)
      if (!match) throw new Error('parse error')
      const result = JSON.parse(match[1]) as AiParsedTask
      setParsed(result)
    } catch {
      setError('AIの解析に失敗しました。もう少し詳しく入力してみてください。')
    } finally {
      setLoading(false)
    }
  }

  const confirm = () => {
    if (!parsed) return
    const newTodo: TodoDefinition = {
      id: createTodoId(parsed.label),
      label: parsed.label,
      section: parsed.section,
      timing: parsed.timing ?? 'morning',
      minutes: parsed.minutes ?? undefined,
      isMust: false,
      is_active: true,
      field_type: parsed.field_type !== 'checkbox' ? parsed.field_type : undefined,
      field_options: parsed.field_options ?? undefined,
    }
    setTodos(prev => [...prev, newTodo])
    setAdded(true)
    setParsed(null)
    setInput('')
  }

  const sectionLabel: Record<HabitCategory, string> = {
    'identity': 'Identity（核心）',
    'growth':   'Growth（成長）',
    'body':     'Body（身体）',
    'mind':     'Mind（精神）',
    'system':   'System（運用）',
  }

  const fieldTypeLabel: Record<TaskFieldType, string> = {
    checkbox: 'チェックボックス',
    number:   '数値入力',
    percent:  'パーセント',
    select:   '選択リスト',
    radio:    'ラジオ',
    text:     'テキスト',
    'text-ai':'テキスト＋AI',
    url:      'URL',
  }

  return (
    <div className="space-y-3 rounded-[28px] border border-white/[0.06] bg-[#111827]/78 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#8da4c3]">AIに項目を登録してもらう</p>
      <p className="text-[11px] text-white/42">
        追加したい項目を自然な言葉で伝えると、AIが適切な設定を提案します。
      </p>

      {added && (
        <div className="rounded-2xl border border-[#22c55e]/25 bg-[#22c55e]/8 px-3 py-2.5">
          <p className="text-xs text-[#4ade80]">追加しました。タスク定義タブで確認できます。</p>
        </div>
      )}

      {parsed && !added && (
        <div className="space-y-3 rounded-2xl border border-[#a78bfa]/20 bg-[#a78bfa]/5 p-4">
          <p className="text-[11px] font-semibold text-[#c4b5fd]">{parsed.confirmation}</p>
          <div className="space-y-1.5">
            <Row label="項目名" value={parsed.label} />
            <Row label="セクション" value={sectionLabel[parsed.section] ?? parsed.section} />
            <Row label="入力タイプ" value={fieldTypeLabel[parsed.field_type] ?? parsed.field_type} />
            {parsed.minutes && <Row label="目安時間" value={`${parsed.minutes}分`} />}
            {parsed.field_options?.unit && <Row label="単位" value={parsed.field_options.unit} />}
            {parsed.field_options?.choices && (
              <Row label="選択肢" value={parsed.field_options.choices.join(' / ')} />
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={confirm}
              className="flex-1 rounded-full border border-[#a78bfa]/40 bg-[#a78bfa]/15 py-2 text-xs font-semibold text-[#c4b5fd]"
            >
              はい、追加する
            </button>
            <button
              type="button"
              onClick={() => setParsed(null)}
              className="flex-1 rounded-full border border-white/10 py-2 text-xs text-white/40 hover:text-white/70"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400/80">{error}</p>
      )}

      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void parse()
            }
          }}
          placeholder="例: 毎朝起きたら体重を計って記録したい"
          rows={2}
          className="flex-1 resize-none rounded-2xl border border-white/10 bg-[#0b1320] px-3 py-2.5 text-sm text-white placeholder-white/20"
          disabled={loading}
        />
        <button
          type="button"
          onClick={() => void parse()}
          disabled={loading || !input.trim()}
          className="flex items-center gap-1.5 self-end rounded-full border border-[#a78bfa]/30 bg-[#a78bfa]/12 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#c4b5fd] disabled:opacity-30"
        >
          <AiMark />
          {loading ? '…' : 'AI'}
        </button>
      </div>
    </div>
  )
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-start gap-2">
    <span className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/36 pt-0.5 w-20">{label}</span>
    <span className="text-xs text-white/80">{value}</span>
  </div>
)

// ─── F-16: iOS Shortcuts JWT トークン表示 UI ─────────────────

const JwtTokenSection = () => {
  const [token, setToken] = useState<string>('')
  const [tokenCopied, setTokenCopied] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('auth:token') ?? ''
    setToken(stored)
  }, [])

  const handleCopyToken = async () => {
    if (!token) return
    try {
      await navigator.clipboard.writeText(token)
      setTokenCopied(true)
      setTimeout(() => setTokenCopied(false), 2000)
    } catch {
      // クリップボードアクセス失敗時は無視
    }
  }

  if (!token) return null

  return (
    <div className="rounded-[28px] border border-white/[0.06] bg-[#111827]/78 p-4 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#8da4c3]">iOS Shortcuts 連携 — JWT トークン</p>
      <p className="text-[11px] text-white/42">
        iOS ショートカットの Authorization ヘッダーに使用するアクセストークンです。
      </p>
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0b1320] px-3 py-2">
        <span className="flex-1 truncate text-[11px] font-mono text-white/60">
          {token.length > 40 ? `${token.slice(0, 20)}...${token.slice(-10)}` : token}
        </span>
        <button
          type="button"
          onClick={() => void handleCopyToken()}
          className={[
            'shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors',
            tokenCopied
              ? 'border-[#22c55e]/30 bg-[#22c55e]/10 text-[#4ade80]'
              : 'border-white/10 text-white/42 hover:border-white/25 hover:text-white/70',
          ].join(' ')}
        >
          {tokenCopied ? 'Copied' : 'コピー'}
        </button>
      </div>
    </div>
  )
}

// ─── iOS Shortcuts 連携設定 ──────────────────────────────────

const IntegrationsSettings = () => {
  const [copied, setCopied] = useState(false)
  const [showSteps, setShowSteps] = useState(false)

  const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
  const webhookUrl = `${apiBase}/api/integrations/log`

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // クリップボードアクセス失敗時は無視
    }
  }

  return (
    <div className="rounded-[28px] border border-white/[0.06] bg-[#111827]/78 p-4 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#8da4c3]">外部連携 — iOS Shortcuts</p>
      <p className="text-[11px] text-white/42">
        iOSのショートカットからApple Healthのデータをこのアプリへ自動送信できます。
      </p>

      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/36">Webhook URL</p>
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0b1320] px-3 py-2">
          <span className="flex-1 truncate text-[11px] font-mono text-white/60">{webhookUrl}</span>
          <button
            type="button"
            onClick={() => void copyUrl()}
            className={[
              'shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors',
              copied
                ? 'border-[#22c55e]/30 bg-[#22c55e]/10 text-[#4ade80]'
                : 'border-white/10 text-white/42 hover:border-white/25 hover:text-white/70',
            ].join(' ')}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/36">対応メトリクス</p>
        <div className="flex flex-wrap gap-1.5">
          {['weight', 'steps', 'sleep_hours', 'heart_rate', 'workout_minutes'].map(m => (
            <span key={m} className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] font-mono text-white/50">
              {m}
            </span>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowSteps(v => !v)}
        className="text-[10px] uppercase tracking-[0.16em] text-white/30 hover:text-white/55"
      >
        {showSteps ? 'セットアップ手順を閉じる ▲' : 'セットアップ手順を見る ▼'}
      </button>

      {showSteps && (
        <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/36">セットアップ手順</p>
          {[
            '1. iOSの「ショートカット」アプリを開く',
            '2. 新しいショートカットを作成',
            '3.「URLの内容を取得」アクションを追加',
            '4. URL に上記 Webhook URL を設定',
            '5. メソッドを POST に変更',
            '6. ヘッダーに Authorization: Bearer {JWTトークン} を追加',
            '7. 本文に {"metric": "weight", "value": 70.5, "unit": "kg"} を設定',
            '8. Apple Health オートメーションからショートカットを呼び出す',
          ].map((step, i) => (
            <p key={i} className="text-[11px] text-white/52">{step}</p>
          ))}
        </div>
      )}
    </div>
  )
}

export const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState<'tasks' | 'ai'>('tasks')

  return (
    <div className="pb-6">
      {/* タブヘッダー */}
      <div className="flex gap-0 border-b border-white/[0.06] px-4 pt-2">
        {(['tasks', 'ai'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTab(t)}
            className={[
              'px-4 pb-2.5 pt-2 text-sm font-semibold transition-colors',
              activeTab === t
                ? 'border-b-2 border-[#7dd3fc] text-white'
                : 'text-white/40 hover:text-white/70',
            ].join(' ')}
          >
            {t === 'tasks' ? 'タスク定義' : 'AI・設定'}
          </button>
        ))}
      </div>

      {activeTab === 'tasks' && (
        <>
          <div className="px-4 pt-4 pb-2">
            <AiTaskCreator />
          </div>
          <TodoManager />
        </>
      )}

      {activeTab === 'ai' && (
        <div className="px-4 pt-4 pb-2 space-y-3">
          <LangSettings />
          <ProfileSettings />
          <WeightTargetSettings />
          <IntegrationsSettings />
          <JwtTokenSection />
          <ApiKeySettings />
          <div className="rounded-[28px] border border-white/[0.06] bg-[#111827]/78 p-4">
            <p className="mb-3 text-[11px] text-white/34">
              「なりたい姿」や「やりたいこと」を入力すると、朝・夜の習慣リスト候補をAIが提案します。
            </p>
            <AiSetupChat />
          </div>
        </div>
      )}
    </div>
  )
}
