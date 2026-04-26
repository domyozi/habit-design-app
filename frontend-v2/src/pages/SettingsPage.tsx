import { useState } from 'react'
import { useLocalStorage } from '@/lib/storage'
import { callClaude } from '@/lib/ai'
import { WannaBeTab } from '@/components/tabs/WannaBeTab'
import { TODO_SECTIONS, bySectionAll, createTodoId, useTodoDefinitions, type TodoDefinition, type TodoSection } from '@/lib/todos'

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
    section: TodoSection,
    isMust = false
  ) => {
    const dedupeKey = `${section}:${normalizeLabel(item.label)}`
    if (!item.label.trim() || exists.has(dedupeKey)) return

    exists.add(dedupeKey)
    nextTodos.push({
      id: createTodoId(item.label),
      label: item.label.trim(),
      section,
      minutes: item.minutes,
      isMust,
      is_active: true,
    })
  }

  suggestion.morning.forEach(item => {
    appendTodo(item, item.isMust ? 'morning-must' : 'morning-routine', Boolean(item.isMust))
  })
  getEveningReflectionItems(suggestion).forEach(item => {
    appendTodo(item, 'evening-reflection')
  })
  getEveningPrepItems(suggestion).forEach(item => {
    appendTodo(item, 'evening-prep')
  })

  return nextTodos
}

const replaceSectionsFromAiSuggestion = (
  currentTodos: TodoDefinition[],
  suggestion: AiHabitSuggestion
): TodoDefinition[] => {
  const replaceTargets: TodoSection[] = ['morning-must', 'morning-routine', 'evening-reflection', 'evening-prep']
  const preserved = currentTodos.map(todo =>
    replaceTargets.includes(todo.section) ? { ...todo, is_active: false } : todo
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
          className="rounded-full border border-[#38bdf8]/30 bg-[#38bdf8]/12 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#8ed8ff] disabled:opacity-30"
        >
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
  const [drafts, setDrafts] = useState<Record<TodoSection, { label: string; minutes: string }>>({
    'morning-must': { label: '', minutes: '' },
    'morning-routine': { label: '', minutes: '' },
    'evening-reflection': { label: '', minutes: '' },
    'evening-prep': { label: '', minutes: '' },
  })

  const updateDraft = (section: TodoSection, key: 'label' | 'minutes', value: string) => {
    setDrafts(prev => ({ ...prev, [section]: { ...prev[section], [key]: value } }))
  }

  const addTodo = (section: TodoSection) => {
    const draft = drafts[section]
    const label = draft.label.trim()
    if (!label) return

    const newTodo: TodoDefinition = {
      id: createTodoId(label),
      label,
      section,
      minutes: draft.minutes ? Number(draft.minutes) : undefined,
      isMust: section === 'morning-must',
      is_active: true,
    }

    setTodos(prev => [...prev, newTodo])
    setDrafts(prev => ({ ...prev, [section]: { label: '', minutes: '' } }))
  }

  const hideTodo = (id: string) => {
    setTodos(prev => prev.map(todo => (
      todo.id === id ? { ...todo, is_active: false } : todo
    )))
  }

  const restoreTodo = (id: string) => {
    setTodos(prev => prev.map(todo => (
      todo.id === id ? { ...todo, is_active: true } : todo
    )))
  }

  return (
    <div className="px-4 pt-2 pb-2">
      <div className="mb-3 rounded-[24px] border border-[#9fb4d1]/10 bg-[linear-gradient(180deg,rgba(9,16,27,0.96),rgba(8,13,22,0.92))] px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#8da4c3]">Task definitions</p>
        <p className="mt-2 text-sm text-white/78">朝と夜のチェックリストをここで定義します。</p>
        <p className="mt-1 text-[11px] text-white/34">
          ここで追加・削除した項目は、朝と夜のチェックリストにそのまま反映されます。
        </p>
      </div>
      <div className="space-y-3">
        {TODO_SECTIONS.map(section => {
          const activeItems = bySectionAll(todos, section.id).filter(todo => todo.is_active)
          const inactiveItems = bySectionAll(todos, section.id).filter(todo => !todo.is_active)
          const draft = drafts[section.id]

          return (
            <div key={section.id} className="space-y-3 rounded-2xl border border-white/[0.06] bg-[#111827]/70 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: section.accent }}>
                  {section.label}
                </p>
                <span className="text-[10px] text-white/28">{activeItems.length} items</span>
              </div>

              <div className="space-y-2">
                {activeItems.map(item => (
                  <div key={item.id} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#0b1320] px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white/80">{item.label}</p>
                      <p className="text-[10px] text-white/28">
                        {item.minutes ? `${item.minutes}分` : '所要時間なし'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => hideTodo(item.id)}
                      className="rounded-full border border-amber-400/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300 hover:bg-amber-400/10"
                    >
                      Hide
                    </button>
                  </div>
                ))}
                {activeItems.length === 0 && (
                  <p className="text-[11px] text-white/32">有効な To Do はありません。</p>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={draft.label}
                  onChange={e => updateDraft(section.id, 'label', e.target.value)}
                  placeholder="新しい To Do 名"
                  className="flex-1 rounded-2xl border border-white/10 bg-[#0b1320] px-3 py-2 text-sm text-white placeholder-white/20"
                />
                <input
                  type="number"
                  min="0"
                  value={draft.minutes}
                  onChange={e => updateDraft(section.id, 'minutes', e.target.value)}
                  placeholder="分"
                  className="w-20 rounded-2xl border border-white/10 bg-[#0b1320] px-3 py-2 text-sm text-white placeholder-white/20"
                />
                <button
                  type="button"
                  onClick={() => addTodo(section.id)}
                  disabled={!draft.label.trim()}
                  className="rounded-full border border-[#7dd3fc]/30 bg-[#7dd3fc]/12 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#aee5ff] disabled:opacity-30"
                >
                  Add
                </button>
              </div>

              {inactiveItems.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                    Hidden items
                  </p>
                  <div className="space-y-2">
                    {inactiveItems.map(item => (
                      <div key={item.id} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#0b1320] px-3 py-2 opacity-75">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-white/60">{item.label}</p>
                          <p className="text-[10px] text-white/28">
                            {item.minutes ? `${item.minutes}分` : '所要時間なし'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => restoreTodo(item.id)}
                          className="rounded-full border border-sky-400/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300 hover:bg-sky-400/10"
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
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

export const SettingsPage = () => (
  <div className="pb-6">
    <TodoManager />

    <div className="px-4 pt-4 pb-2">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8ed8ff]">AI setup</p>
      </div>
      <div className="space-y-3">
        <ApiKeySettings />
        <div className="rounded-[28px] border border-white/[0.06] bg-[#111827]/78 p-4">
          <p className="mb-3 text-[11px] text-white/34">
            「なりたい姿」や「やりたいこと」を入力すると、朝・夜の習慣リスト候補をAIが提案します。
          </p>
          <AiSetupChat />
        </div>
      </div>
    </div>

    <div className="px-4 pt-2">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#f5c46b]">Wanna Be</p>
    </div>
    <WannaBeTab />
  </div>
)
