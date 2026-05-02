import { useState, useEffect, useCallback, useRef } from 'react'
import {
  fetchHealthToken,
  regenerateHealthToken,
  fetchHabitSuggestions,
  createHabitSuggestion,
  clearPendingHabitSuggestions,
  updateHabitSuggestionStatus,
  type HabitSuggestion,
} from '@/lib/api'
import { callClaude } from '@/lib/ai'
import { HABIT_CATEGORIES, bySectionAll, createTodoId, useTodoDefinitions, type TodoDefinition, type HabitCategory, type HabitTiming, type TaskFieldType, type TaskFieldOptions } from '@/lib/todos'
import { AiMark } from '@/components/ui/AiMark'
import { useUserContext } from '@/lib/user-context'
import { useUserProfile } from '@/hooks/useUserProfile'
import { supabase } from '@/lib/supabase'
import type { AppLang } from '@/lib/lang'

// 数値系 field_type のとき unit 入力欄を出すかどうかの判定
const NUMERIC_FIELD_TYPES = new Set<string>(['number', 'percent'])

interface AddDraft {
  label: string
  field_type: TaskFieldType
  unit: string
}

interface EditDraft {
  label: string
  field_type: TaskFieldType
  unit: string
  monthly_target: string
}

const TodoManager = ({ visibleSections }: { visibleSections?: HabitCategory[] } = {}) => {
  const [todos, setTodos] = useTodoDefinitions()
  const [draft, setDraft] = useState<AddDraft>({ label: '', field_type: 'checkbox', unit: '' })
  const sections = visibleSections
    ? HABIT_CATEGORIES.filter(c => visibleSections.includes(c.id))
    : HABIT_CATEGORIES
  const [openSection, setOpenSection] = useState<HabitCategory | null>(sections[0]?.id ?? 'habit')
  // どのセクションで追加フォームを開いているか（null = 閉）
  const [addingIn, setAddingIn] = useState<HabitCategory | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [editing, setEditing] = useState<Record<string, EditDraft>>({})

  const updateDraft = <K extends keyof AddDraft>(key: K, value: AddDraft[K]) =>
    setDraft(prev => ({ ...prev, [key]: value }))

  const startAdding = (section: HabitCategory) => {
    setDraft({ label: '', field_type: 'checkbox', unit: '' })
    setAddingIn(section)
  }

  const addTodo = (section: HabitCategory) => {
    const label = draft.label.trim()
    if (!label) return
    const unit = draft.unit.trim()
    const newTodo: TodoDefinition = {
      id: createTodoId(label),
      label,
      section,
      timing: 'morning',
      is_active: true,
      monthly_target: section === 'habit' ? 20 : undefined,
      field_type: draft.field_type,
      field_options: NUMERIC_FIELD_TYPES.has(draft.field_type) && unit
        ? { unit }
        : undefined,
    }
    setTodos(prev => [...prev, newTodo])
    setDraft({ label: '', field_type: 'checkbox', unit: '' })
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
        field_type: item.field_type ?? 'checkbox',
        unit: item.field_options?.unit ?? '',
        monthly_target: item.monthly_target != null ? String(item.monthly_target) : '',
      },
    }))

  const cancelEdit = (id: string) =>
    setEditing(prev => { const n = { ...prev }; delete n[id]; return n })

  const saveEdit = (id: string) => {
    const e = editing[id]
    if (!e?.label.trim()) return
    const mt = parseInt(e.monthly_target, 10)
    const unit = e.unit.trim()
    setTodos(prev => prev.map(t => t.id === id ? {
      ...t,
      label: e.label.trim(),
      field_type: e.field_type,
      field_options: NUMERIC_FIELD_TYPES.has(e.field_type) && unit
        ? { ...(t.field_options ?? {}), unit }
        : t.field_options,
      monthly_target: !isNaN(mt) && mt > 0 ? mt : undefined,
    } : t))
    cancelEdit(id)
  }

  const allHidden = todos.filter(t => !t.is_active)

  return (
    <div className="px-4 py-3 space-y-2">
      {sections.map(section => {
        const activeItems = bySectionAll(todos, section.id).filter(t => t.is_active)
        const isOpen = openSection === section.id
        const isNumericDraft = NUMERIC_FIELD_TYPES.has(draft.field_type)

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
                      const isNumericEdit = ed ? NUMERIC_FIELD_TYPES.has(ed.field_type) : false
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
                              <div className="flex flex-wrap items-center gap-3 pl-1">
                                <select
                                  value={ed.field_type}
                                  onChange={e => setEditing(prev => ({ ...prev, [item.id]: { ...prev[item.id], field_type: e.target.value as TaskFieldType } }))}
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
                                {isNumericEdit && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-white/30">単位</span>
                                    <input
                                      type="text"
                                      value={ed.unit}
                                      onChange={e => setEditing(prev => ({ ...prev, [item.id]: { ...prev[item.id], unit: e.target.value } }))}
                                      placeholder="kg / km / 歩"
                                      className="w-20 rounded-lg border border-white/[0.08] bg-[#08111c] px-2 py-1 text-[10px] text-white/55 focus:outline-none"
                                    />
                                  </div>
                                )}
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-white/30">月目標</span>
                                  <input
                                    type="number"
                                    min="0"
                                    max="31"
                                    value={ed.monthly_target}
                                    onChange={e => setEditing(prev => ({ ...prev, [item.id]: { ...prev[item.id], monthly_target: e.target.value } }))}
                                    placeholder="20"
                                    className="w-14 rounded-lg border border-white/[0.08] bg-[#08111c] px-2 py-1 text-[10px] text-white/55 focus:outline-none"
                                  />
                                  <span className="text-[10px] text-white/25">回/月</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            /* ── 表示モード ── */
                            <div className="flex items-center gap-3">
                              <p className="flex-1 text-sm text-white/72 leading-snug">{item.label}</p>
                              {item.field_type && item.field_type !== 'checkbox' && (
                                <span className="shrink-0 rounded-full bg-white/[0.04] px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-white/35">
                                  {item.field_type}{item.field_options?.unit ? ` ${item.field_options.unit}` : ''}
                                </span>
                              )}
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
                  <p className="px-1 py-2 text-[11px] text-white/22">まだ項目がありません</p>
                )}

                {/* 追加フォーム */}
                {addingIn === section.id ? (
                  <div className="mt-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={draft.label}
                        onChange={e => updateDraft('label', e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') addTodo(section.id)
                          if (e.key === 'Escape') setAddingIn(null)
                        }}
                        placeholder="項目名を入力…"
                        autoFocus
                        className="flex-1 rounded-xl border border-white/[0.08] bg-[#08111c] px-3 py-2 text-sm text-white/88 placeholder-white/20 focus:border-white/16 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => addTodo(section.id)}
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
                    <div className="flex flex-wrap items-center gap-3 pl-1">
                      <select
                        value={draft.field_type}
                        onChange={e => updateDraft('field_type', e.target.value as TaskFieldType)}
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
                      {isNumericDraft && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-white/30">単位</span>
                          <input
                            type="text"
                            value={draft.unit}
                            onChange={e => updateDraft('unit', e.target.value)}
                            placeholder="kg / km / 歩"
                            className="w-20 rounded-lg border border-white/[0.08] bg-[#08111c] px-2 py-1 text-[10px] text-white/55 focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startAdding(section.id)}
                    className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-white/22 transition-colors hover:bg-white/[0.03] hover:text-white/45"
                  >
                    <span className="text-sm leading-none">+</span>
                    <span className="text-[11px]">項目を追加</span>
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

const ProfileSettings = () => {
  const [ctx, updateCtx] = useUserContext()
  const { profile, update: updateProfile } = useUserProfile(true)
  const [displayName, setDisplayName] = useState(ctx?.display_name ?? '')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [ageDraft, setAgeDraft] = useState<string>('')
  const isComposing = useRef(false)
  const isFocused = useRef(false)
  const ageFocused = useRef(false)

  // ctx ロード後に同期（フォーカス中は上書きしない — IME 二重入力防止）
  useEffect(() => {
    if (!isFocused.current && ctx?.display_name !== undefined) {
      setDisplayName(ctx.display_name)
    }
  }, [ctx?.display_name])

  // profile ロード時に年齢入力を同期
  useEffect(() => {
    if (!ageFocused.current && profile) {
      setAgeDraft(profile.age == null ? '' : String(profile.age))
    }
  }, [profile?.age])

  const saveDisplayName = () => {
    void updateCtx({ display_name: displayName.trim() })
  }

  const saveAge = () => {
    const trimmed = ageDraft.trim()
    if (trimmed === '') return
    const parsed = Number(trimmed)
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 150) return
    if (profile && profile.age === parsed) return
    void updateProfile({ age: parsed })
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (error) return
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      await updateCtx({ avatar_url: data.publicUrl })
    } finally {
      setAvatarUploading(false)
      e.target.value = ''
    }
  }

  const currentAvatar = ctx?.avatar_url

  return (
    <div className="rounded-[28px] border border-white/[0.06] bg-[#111827]/78 px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#8da4c3]">プロフィール</p>

      {/* アバター */}
      <div className="mt-3 flex items-center gap-3">
        <div className="relative">
          {currentAvatar ? (
            <img src={currentAvatar} alt="avatar" className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#7dd3fc]/20 text-base font-bold text-[#7dd3fc]">
              {(ctx?.display_name?.[0] ?? '?').toUpperCase()}
            </div>
          )}
        </div>
        <label className={['cursor-pointer rounded-full border border-white/[0.1] px-3 py-1.5 text-[11px] text-white/50 transition-colors hover:border-white/25 hover:text-white/70', avatarUploading ? 'opacity-40 pointer-events-none' : ''].join(' ')}>
          {avatarUploading ? '...' : '画像を変更'}
          <input type="file" accept="image/*" className="hidden" onChange={e => void handleAvatarChange(e)} />
        </label>
        {currentAvatar && (
          <button type="button" onClick={() => void updateCtx({ avatar_url: '' })} className="text-[11px] text-white/25 hover:text-white/50">
            削除
          </button>
        )}
      </div>

      {/* 表示名 */}
      <div className="mt-3">
        <p className="mb-1.5 text-[11px] text-white/38">表示名</p>
        <input
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          onFocus={() => { isFocused.current = true }}
          onBlur={() => { isFocused.current = false; if (!isComposing.current) saveDisplayName() }}
          onCompositionStart={() => { isComposing.current = true }}
          onCompositionEnd={() => { isComposing.current = false }}
          onKeyDown={e => { if (e.key === 'Enter' && !isComposing.current) { saveDisplayName(); (e.target as HTMLInputElement).blur() } }}
          placeholder="表示名を入力..."
          className="w-full rounded-xl border border-white/[0.1] bg-[#08111c] px-3 py-2 text-sm text-white/80 placeholder-white/20 focus:border-white/20 focus:outline-none"
        />
      </div>

      {/* 年齢: AI への語調・難易度ヒント */}
      <div className="mt-3">
        <p className="mb-1.5 text-[11px] text-white/38">年齢（AI コーチの語調・難易度を調整）</p>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={150}
          step={1}
          value={ageDraft}
          onChange={e => setAgeDraft(e.target.value)}
          onFocus={() => { ageFocused.current = true }}
          onBlur={() => { ageFocused.current = false; saveAge() }}
          onKeyDown={e => { if (e.key === 'Enter') { saveAge(); (e.target as HTMLInputElement).blur() } }}
          placeholder="例: 30"
          className="w-full rounded-xl border border-white/[0.1] bg-[#08111c] px-3 py-2 text-sm text-white/80 placeholder-white/20 focus:border-white/20 focus:outline-none"
        />
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
- 中核的な習慣化対象（早起き・運動・学習継続など） → "habit"
- 成長・学習・副業など → "growth"
- 身体管理（運動・体重・睡眠など） → "body"
- 精神・集中・瞑想など → "mind"
- システム・計画・記録・確認など → "system"
- 単発の作業や個別タスク → "task"

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
    habit: 'Habit（習慣）',
    task:  'タスク',
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
          <p className="text-xs text-[#4ade80]">{addedCount}件追加しました。習慣化・記録タブで確認できます。</p>
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

const maskToken = (token: string | null | undefined) => {
  if (!token) return '読込中...'
  if (token.length <= 12) return '••••••••'
  return `${token.slice(0, 6)}••••••••••••${token.slice(-4)}`
}

// ─── Apple Health 連携設定 ──────────────────────────────────

const IntegrationsSettings = () => {
  const [token, setToken] = useState<string | null>(null)
  const [configured, setConfigured] = useState(false)
  const [tokenLoading, setTokenLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showSteps, setShowSteps] = useState(false)

  const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
  const batchUrl = `${apiBase}/api/integrations/batch`

  const loadToken = useCallback(async () => {
    try {
      const t = await fetchHealthToken()
      setConfigured(t.configured)
      if (t.token) setToken(t.token)
    } catch { /* 未ログイン時は無視 */ }
  }, [])

  useEffect(() => { void loadToken() }, [loadToken])

  const handleCopy = async () => {
    if (!token) return
    await navigator.clipboard.writeText(token).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRegenerate = async () => {
    if (!confirm('トークンを再生成すると、既存のショートカットが使えなくなります。続けますか？')) return
    setTokenLoading(true)
    try {
      const t = await regenerateHealthToken()
      setConfigured(t.configured)
      setToken(t.token ?? null)
    } finally {
      setTokenLoading(false)
    }
  }

  const tokenLabel = token ? maskToken(token) : configured ? '設定済み（再生成時のみ表示）' : '未設定'

  return (
    <div className="rounded-[28px] border border-white/[0.06] bg-[#111827]/78 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#34d399]/80">Apple Health 連携</p>
        {configured && <span className="rounded-full bg-[#34d399]/15 px-2 py-0.5 text-[9px] text-[#34d399]">設定済み</span>}
      </div>
      <p className="text-[11px] text-white/42">
        iOSショートカットからApple Healthのデータを自動送信できます。トークンは新規発行または再生成した直後だけ表示されます。
      </p>

      {/* Token */}
      <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/36">あなたのトークン</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0b1320] px-3 py-2 text-[11px] font-mono text-white/60 truncate">
              {tokenLabel}
            </code>
          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={!token}
            className={['shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors',
              copied ? 'border-[#22c55e]/30 bg-[#22c55e]/10 text-[#4ade80]' : 'border-[#34d399]/30 bg-[#34d399]/10 text-[#34d399] hover:bg-[#34d399]/20'].join(' ')}
          >
            {copied ? 'Copied ✓' : 'コピー'}
          </button>
          <button
            type="button"
            onClick={() => void handleRegenerate()}
            disabled={tokenLoading}
            className="shrink-0 rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] text-white/30 hover:text-white/60 transition-colors"
          >
            {tokenLoading ? '...' : '再生成'}
          </button>
        </div>
      </div>

      {/* Setup steps toggle */}
      <button
        type="button"
        onClick={() => setShowSteps(v => !v)}
        className="text-[10px] uppercase tracking-[0.16em] text-white/30 hover:text-white/55"
      >
        {showSteps ? 'セットアップ手順を閉じる ▲' : 'セットアップ手順を見る ▼'}
      </button>

      {showSteps && (
        <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3 space-y-2">
          {[
            'iPhoneの「ショートカット」アプリを開く',
            '「オートメーション」→「新規オートメーション」→「毎日（例: AM 7:00）」',
            '「URLの内容を取得」アクションを追加',
            `URL: ${batchUrl}`,
            'メソッド: POST',
            `ヘッダー: X-Shortcuts-Token = ${token ?? '再生成後に表示されるトークン'}`,
            '本文(JSON): {"metrics":[{"metric":"steps","value":歩数,"unit":"count"},{"metric":"weight","value":体重,"unit":"kg"},…]}',
            'Apple Health から各値を変数で読み取り JSON に組み込む',
          ].map((step, i) => (
            <div key={i} className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[9px] font-bold text-white/40">{i + 1}</span>
              <p className="text-[11px] leading-relaxed text-white/52">{step}</p>
            </div>
          ))}
          <div className="pt-1">
            <p className="mb-1 text-[9px] text-white/30">送信できる metric 一覧</p>
            <div className="flex flex-wrap gap-1">
              {['steps','distance_walked','active_calories','resting_calories','workout_minutes',
                'heart_rate','resting_heart_rate','hrv','sleep_hours',
                'weight','bmi','body_fat','blood_oxygen','respiratory_rate','mindful_minutes'].map(m => (
                <code key={m} className="rounded border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-white/36">{m}</code>
              ))}
            </div>
          </div>
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

// ─── 習慣候補パネル ───────────────────────────────────────────
const HabitSuggestionsPanel = ({ kind }: { kind: 'habit' | 'task' }) => {
  const [, setTodos] = useTodoDefinitions()
  const [pending, setPending] = useState<HabitSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const isComposing = useRef(false)

  const reload = useCallback(async () => {
    try {
      const list = await fetchHabitSuggestions({ status: 'pending', kind })
      setPending(list)
    } catch { /* ignore */ }
  }, [kind])

  useEffect(() => { void reload() }, [reload])

  const headerLabel = kind === 'habit' ? '習慣候補' : 'タスク候補'
  const headerDesc = kind === 'habit'
    ? 'ジャーナルから抽出された継続トラッキング候補。採用すると Habit カテゴリに追加されます。'
    : 'ジャーナルから抽出された個別タスク候補。採用するとタスクカテゴリに追加されます。'
  const accentColor = kind === 'habit' ? '#ff6b35' : '#94a3b8'

  const handleAccept = async (s: HabitSuggestion) => {
    setTodos(prev => {
      if (prev.some(t => t.label.trim() === s.label.trim() && t.section === kind && t.is_active)) return prev
      const newTodo: TodoDefinition = {
        id: createTodoId(s.label),
        label: s.label,
        section: kind,
        timing: 'morning',
        is_active: true,
        ...(kind === 'habit' ? { monthly_target: 20 } : {}),
      }
      return [...prev, newTodo]
    })
    try {
      await updateHabitSuggestionStatus(s.id, 'accepted')
    } catch { /* ignore */ }
    setPending(prev => prev.filter(p => p.id !== s.id))
  }

  const handleReject = async (s: HabitSuggestion) => {
    try {
      await updateHabitSuggestionStatus(s.id, 'rejected')
    } catch { /* ignore */ }
    setPending(prev => prev.filter(p => p.id !== s.id))
  }

  const handleManualAdd = async () => {
    const label = draft.trim()
    if (!label) return
    setLoading(true)
    try {
      const created = await createHabitSuggestion(label, 'manual', kind)
      setPending(prev => [created, ...prev])
      setDraft('')
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  const handleClearAll = async () => {
    if (pending.length === 0) return
    if (!window.confirm(`pending な${headerLabel}を全て不要扱いにしますか？（${pending.length} 件）`)) return
    try {
      await clearPendingHabitSuggestions(kind)
      setPending([])
    } catch { /* ignore */ }
  }

  return (
    <div className="rounded-[28px] border border-white/[0.06] bg-[#111827]/78 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#8da4c3]">{headerLabel}</p>
          <p className="mt-1 text-[11px] text-white/38">{headerDesc}</p>
        </div>
        {pending.length > 1 && (
          <button
            type="button"
            onClick={() => void handleClearAll()}
            className="shrink-0 rounded-full border border-white/[0.08] px-3 py-1 text-[10px] text-white/40 hover:border-white/[0.18] hover:text-white/70"
          >
            × 全部不要
          </button>
        )}
      </div>

      {/* 候補リスト */}
      {pending.length > 0 ? (
        <div className="space-y-2">
          {pending.map(s => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-2xl px-3 py-2 border"
              style={{ borderColor: `${accentColor}33`, backgroundColor: `${accentColor}0d` }}
            >
              <span className="flex-1 text-sm text-white/85">{s.label}</span>
              {s.source && s.source !== 'manual' && (
                <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-white/35">
                  {s.source}
                </span>
              )}
              <button
                type="button"
                onClick={() => void handleAccept(s)}
                className="shrink-0 rounded-full border border-[#22c55e]/35 bg-[#22c55e]/12 px-3 py-1 text-[11px] font-semibold text-[#4ade80]"
              >
                ✓ 採用
              </button>
              <button
                type="button"
                onClick={() => void handleReject(s)}
                className="shrink-0 rounded-full border border-white/[0.1] px-3 py-1 text-[11px] text-white/40 hover:text-white/70"
              >
                × 不要
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-white/[0.08] px-3 py-4 text-center text-[11px] text-white/30">
          現在の候補はありません。ジャーナル保存時に自動抽出されます。
        </p>
      )}

      {/* 手動追加 */}
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onCompositionStart={() => { isComposing.current = true }}
          onCompositionEnd={() => { isComposing.current = false }}
          onKeyDown={e => { if (e.key === 'Enter' && !isComposing.current) void handleManualAdd() }}
          placeholder={kind === 'habit' ? '習慣候補を追加...' : 'タスク候補を追加...'}
          className="flex-1 rounded-xl border border-white/[0.1] bg-[#08111c] px-3 py-2 text-sm text-white/80 placeholder-white/20 focus:border-white/20 focus:outline-none"
          disabled={loading}
        />
        <button
          type="button"
          onClick={() => void handleManualAdd()}
          disabled={loading || !draft.trim()}
          className="shrink-0 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-30 border"
          style={{ borderColor: `${accentColor}55`, backgroundColor: `${accentColor}1f`, color: accentColor }}
        >
          + 追加
        </button>
      </div>
    </div>
  )
}

type SettingsTab = 'habit' | 'task' | 'ai' | 'memory'

export const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('habit')

  const tabLabel: Record<SettingsTab, string> = {
    habit: '習慣化',
    task: 'タスク',
    ai: 'AI・設定',
    memory: 'メモリ',
  }

  return (
    <div className="pb-6">
      {/* タブヘッダー */}
      <div className="flex gap-0 border-b border-white/[0.06] px-4 pt-2">
        {(['habit', 'task', 'ai', 'memory'] as const).map(t => (
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

      {activeTab === 'habit' && (
        <>
          <div className="px-4 pt-4 pb-2">
            <HabitSuggestionsPanel kind="habit" />
          </div>
          <TodoManager visibleSections={['habit']} />
        </>
      )}

      {activeTab === 'task' && (
        <>
          <div className="px-4 pt-4 pb-2">
            <HabitSuggestionsPanel kind="task" />
          </div>
          <div className="px-4 pt-2 pb-2">
            <AiTaskCreator />
          </div>
          <TodoManager visibleSections={['task']} />
        </>
      )}

      {activeTab === 'ai' && (
        <div className="px-4 pt-4 pb-2 space-y-3">
          <LangSettings />
          <ProfileSettings />
          <IntegrationsSettings />
        </div>
      )}

      {activeTab === 'memory' && <MemoryView />}
    </div>
  )
}
