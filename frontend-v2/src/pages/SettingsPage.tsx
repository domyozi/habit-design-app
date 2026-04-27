import { useState, useEffect } from 'react'
import { callClaude } from '@/lib/ai'
import { HABIT_CATEGORIES, bySectionAll, createTodoId, useTodoDefinitions, type TodoDefinition, type HabitCategory, type HabitTiming, type TaskFieldType, type TaskFieldOptions } from '@/lib/todos'
import { AiMark } from '@/components/ui/AiMark'
import { useUserContext } from '@/lib/user-context'
import type { AppLang } from '@/lib/lang'

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
  // 編集中アイテム: id → { label, timing, field_type, monthly_target }
  const [editing, setEditing] = useState<Record<string, { label: string; timing: HabitTiming; field_type: string; monthly_target: string }>>({})

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
    setEditing(prev => ({
      ...prev,
      [item.id]: {
        label: item.label,
        timing: item.timing,
        field_type: item.field_type ?? 'checkbox',
        monthly_target: item.monthly_target != null ? String(item.monthly_target) : '',
      },
    }))

  const cancelEdit = (id: string) =>
    setEditing(prev => { const n = { ...prev }; delete n[id]; return n })

  const saveEdit = (id: string) => {
    const e = editing[id]
    if (!e?.label.trim()) return
    const mt = parseInt(e.monthly_target, 10)
    setTodos(prev => prev.map(t => t.id === id ? {
      ...t,
      label: e.label.trim(),
      timing: e.timing,
      field_type: e.field_type as TaskFieldType,
      monthly_target: !isNaN(mt) && mt > 0 ? mt : undefined,
    } : t))
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
                            <div className="space-y-2">
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
                              <div className="flex items-center gap-3 pl-1">
                                <select
                                  value={ed.field_type}
                                  onChange={e => setEditing(prev => ({ ...prev, [item.id]: { ...prev[item.id], field_type: e.target.value } }))}
                                  className="rounded-lg border border-white/[0.08] bg-[#08111c] px-2 py-1 text-[10px] text-white/50 focus:outline-none"
                                >
                                  <option value="checkbox">チェック</option>
                                  <option value="number">数値</option>
                                  <option value="percent">%</option>
                                  <option value="select">選択</option>
                                  <option value="text">テキスト</option>
                                  <option value="text-ai">テキスト+AI</option>
                                  <option value="url">URL</option>
                                </select>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-white/30">月目標</span>
                                  <input
                                    type="number"
                                    min="0"
                                    max="31"
                                    value={ed.monthly_target}
                                    onChange={e => setEditing(prev => ({ ...prev, [item.id]: { ...prev[item.id], monthly_target: e.target.value } }))}
                                    placeholder="–"
                                    className="w-14 rounded-lg border border-white/[0.08] bg-[#08111c] px-2 py-1 text-[10px] text-white/55 focus:outline-none"
                                  />
                                  <span className="text-[10px] text-white/25">回/月</span>
                                </div>
                              </div>
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
                    className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-white/35 transition-all hover:bg-red-500/10 hover:text-red-400"
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

// ─── 言語設定 ─────────────────────────────────────────────────

const LANG_KEY = 'settings:lang'

const LangSettings = () => {
  const [ctx, updateCtx] = useUserContext()
  // API から来た値 → localStorage → 'ja' の優先順で取得
  const lang: AppLang = (ctx?.lang ?? localStorage.getItem(LANG_KEY) ?? 'ja') as AppLang

  const setLang = (next: AppLang) => {
    localStorage.setItem(LANG_KEY, next)
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

ユーザーが複数の習慣を挙げた場合は、それぞれを別々のオブジェクトとして配列で返してください。

必ず以下のJSON形式のみで返答してください（説明文は不要、JSONのみ）：
\`\`\`json
[
  {
    "label": "タスク名（簡潔に）",
    "section": "body",
    "timing": "morning",
    "field_type": "checkbox",
    "minutes": null,
    "field_options": null,
    "confirmation": "こういうことでOKですか？（1文）"
  }
]
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
  const [parsedList, setParsedList] = useState<AiParsedTask[]>([])
  const [error, setError] = useState<string | null>(null)
  const [addedCount, setAddedCount] = useState(0)
  const [, setTodos] = useTodoDefinitions()

  const parse = async () => {
    if (!input.trim() || loading) return
    setLoading(true)
    setParsedList([])
    setError(null)
    setAddedCount(0)

    try {
      const reply = await callClaude(
        [{ role: 'user', content: input.trim() }],
        AI_TASK_PARSE_SYSTEM,
        768
      )
      const match = /```json\s*([\s\S]*?)\s*```/.exec(reply)
      if (!match) throw new Error('parse error')
      const raw = JSON.parse(match[1])
      const results: AiParsedTask[] = Array.isArray(raw) ? raw : [raw]
      if (results.length === 0 || !results[0].label) throw new Error('empty result')
      setParsedList(results)
    } catch {
      setError('AIの解析に失敗しました。もう少し詳しく入力してみてください。')
    } finally {
      setLoading(false)
    }
  }

  const confirmAll = () => {
    if (parsedList.length === 0) return
    const newTodos: TodoDefinition[] = parsedList.map(parsed => ({
      id: createTodoId(parsed.label),
      label: parsed.label,
      section: parsed.section,
      timing: parsed.timing ?? 'morning',
      minutes: parsed.minutes ?? undefined,
      isMust: false,
      is_active: true,
      field_type: parsed.field_type !== 'checkbox' ? parsed.field_type : undefined,
      field_options: parsed.field_options ?? undefined,
    }))
    setTodos(prev => [...prev, ...newTodos])
    setAddedCount(newTodos.length)
    setParsedList([])
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

      {addedCount > 0 && (
        <div className="rounded-2xl border border-[#22c55e]/25 bg-[#22c55e]/8 px-3 py-2.5">
          <p className="text-xs text-[#4ade80]">{addedCount}件追加しました。タスク定義タブで確認できます。</p>
        </div>
      )}

      {parsedList.length > 0 && (
        <div className="space-y-2">
          {parsedList.map((parsed, i) => (
            <div key={i} className="space-y-2 rounded-2xl border border-[#a78bfa]/20 bg-[#a78bfa]/5 p-3">
              {parsed.confirmation && (
                <p className="text-[11px] font-semibold text-[#c4b5fd]">{parsed.confirmation}</p>
              )}
              <div className="space-y-1">
                {parsed.label && <Row label="項目名" value={parsed.label} />}
                {parsed.section && <Row label="セクション" value={sectionLabel[parsed.section] ?? parsed.section} />}
                {parsed.field_type && <Row label="入力タイプ" value={fieldTypeLabel[parsed.field_type] ?? parsed.field_type} />}
                {parsed.minutes ? <Row label="目安時間" value={`${parsed.minutes}分`} /> : null}
                {parsed.field_options?.unit && <Row label="単位" value={parsed.field_options.unit} />}
                {parsed.field_options?.choices && (
                  <Row label="選択肢" value={parsed.field_options.choices.join(' / ')} />
                )}
              </div>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={confirmAll}
              className="flex-1 rounded-full border border-[#a78bfa]/40 bg-[#a78bfa]/15 py-2 text-xs font-semibold text-[#c4b5fd]"
            >
              {parsedList.length > 1 ? `はい、${parsedList.length}件まとめて追加する` : 'はい、追加する'}
            </button>
            <button
              type="button"
              onClick={() => setParsedList([])}
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

// ─── メモリビュー ──────────────────────────────────────────────

const MemoryView = () => {
  const [ctx, updateCtx] = useUserContext()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const startEdit = (field: string, current: string) => {
    setEditing(field)
    setDraft(current)
  }

  const save = async (field: string) => {
    await updateCtx({ [field]: draft })
    setEditing(null)
  }

  if (!ctx) return (
    <div className="px-4 pt-8 text-center text-sm text-white/30">
      メモリデータを読み込み中…
    </div>
  )

  const fields: Array<{ key: string; label: string; desc: string; multiline?: boolean }> = [
    { key: 'identity',       label: 'アイデンティティ',   desc: 'あなたはどんな人物か',          multiline: true },
    { key: 'goal_summary',   label: '目標サマリー',       desc: '現在追いかけているゴール',       multiline: true },
    { key: 'patterns',       label: '行動パターン',       desc: 'AIが観察したあなたの傾向',       multiline: true },
    { key: 'values_keywords',label: '価値観キーワード',   desc: 'コアバリューを表すキーワード' },
  ]

  const getDisplay = (key: string): string => {
    const val = (ctx as Record<string, unknown>)[key]
    if (!val) return ''
    if (Array.isArray(val)) return val.join(', ')
    return String(val)
  }

  const insightEntries = ctx.insights ? Object.entries(ctx.insights as Record<string, unknown>) : []

  return (
    <div className="px-4 pt-4 pb-6 space-y-3">
      <p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">
        AI コーチがあなたについて記憶している情報です。編集・削除できます。
      </p>

      {fields.map(f => {
        const value = getDisplay(f.key)
        const isEditing = editing === f.key
        return (
          <div key={f.key} className="rounded-[20px] border border-white/[0.06] bg-[#111827]/78 px-4 py-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8da4c3]">{f.label}</p>
                <p className="mt-0.5 text-[10px] text-white/28">{f.desc}</p>
              </div>
              {!isEditing && (
                <button
                  type="button"
                  onClick={() => startEdit(f.key, value)}
                  className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-white/30 hover:bg-white/[0.06] hover:text-white/60"
                >
                  ✎
                </button>
              )}
            </div>

            {isEditing ? (
              <div className="mt-2 space-y-2">
                {f.multiline ? (
                  <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    rows={3}
                    autoFocus
                    className="w-full resize-none rounded-xl border border-white/[0.1] bg-[#08111c] px-3 py-2 text-sm text-white/80 focus:outline-none"
                  />
                ) : (
                  <input
                    type="text"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    autoFocus
                    className="w-full rounded-xl border border-white/[0.1] bg-[#08111c] px-3 py-2 text-sm text-white/80 focus:outline-none"
                  />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void save(f.key)}
                    className="rounded-full border border-[#7dd3fc]/30 bg-[#7dd3fc]/10 px-4 py-1.5 text-xs font-semibold text-[#7dd3fc]"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={() => { void updateCtx({ [f.key]: null }); setEditing(null) }}
                    className="rounded-full border border-red-500/20 px-4 py-1.5 text-xs text-red-400/70 hover:border-red-500/40"
                  >
                    削除
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="ml-auto px-2 text-sm text-white/25 hover:text-white/50"
                  >
                    ×
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-white/65 whitespace-pre-wrap">
                {value || <span className="text-white/20 italic">未記録</span>}
              </p>
            )}
          </div>
        )
      })}

      {insightEntries.length > 0 && (
        <div className="rounded-[20px] border border-white/[0.06] bg-[#111827]/78 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8da4c3]">AI インサイト</p>
          <p className="mt-0.5 text-[10px] text-white/28">コーチングセッションから得られた洞察</p>
          <div className="mt-3 space-y-2">
            {insightEntries.map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-white/28 pt-0.5 w-24">{k}</span>
                <span className="text-xs text-white/60">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {insightEntries.length === 0 && fields.every(f => !getDisplay(f.key)) && (
        <div className="rounded-[20px] border border-dashed border-white/[0.08] px-4 py-8 text-center">
          <p className="text-sm text-white/25">まだメモリがありません</p>
          <p className="mt-1 text-[11px] text-white/18">AIコーチと会話すると自動的に蓄積されます</p>
        </div>
      )}
    </div>
  )
}

export const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState<'tasks' | 'ai' | 'memory'>('tasks')

  const tabLabel = { tasks: 'タスク定義', ai: 'AI・設定', memory: 'メモリ' }

  return (
    <div className="pb-6">
      {/* タブヘッダー */}
      <div className="flex gap-0 border-b border-white/[0.06] px-4 pt-2">
        {(['tasks', 'ai', 'memory'] as const).map(t => (
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
            {tabLabel[t]}
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
          <IntegrationsSettings />
          <JwtTokenSection />
          <ApiKeySettings />
        </div>
      )}

      {activeTab === 'memory' && <MemoryView />}
    </div>
  )
}
