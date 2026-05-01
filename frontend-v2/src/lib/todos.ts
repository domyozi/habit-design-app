import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useRef } from 'react'
import { useLocalStorage } from '@/lib/storage'
import { fetchTodoDefinitions, saveTodoDefinitions } from '@/lib/api'

export type HabitCategory = 'habit' | 'growth' | 'body' | 'mind' | 'system' | 'task'
export type HabitTiming   = 'morning' | 'evening' | 'anytime'

// TodoSection は後方互換のために型エイリアスとして残す
export type TodoSection = HabitCategory

export type TaskFieldType =
  | 'checkbox'
  | 'number'
  | 'percent'
  | 'select'
  | 'radio'
  | 'text'
  | 'text-ai'
  | 'url'

export interface TaskFieldOptions {
  choices?: string[]
  unit?: string
  placeholder?: string
  min?: number
  max?: number
}

export interface TodoDefinition {
  id: string
  label: string
  section: HabitCategory   // 旧フィールド名は維持。値が新カテゴリ値になる
  timing: HabitTiming      // 新フィールド（旧 section から分離）
  minutes?: number
  monthly_target?: number
  isMust?: boolean
  is_active: boolean
  field_type?: TaskFieldType
  field_options?: TaskFieldOptions
}

export const DEFAULT_TODO_DEFINITIONS: TodoDefinition[] = [
  // Habit + morning（早起き / 筋トレ / 英語 / 副業 / 有酸素 が習慣化対象）
  { id: 'early-rise', label: '早起き（5時台起床）', section: 'habit', timing: 'morning', isMust: true, is_active: true },
  { id: 'training',   label: '筋トレ',               section: 'habit', timing: 'morning', isMust: true, is_active: true },
  { id: 'english',    label: '英語学習',              section: 'habit', timing: 'morning', isMust: true, is_active: true },
  { id: 'side-proj',  label: '副業推進',              section: 'habit', timing: 'morning', isMust: true, is_active: true },
  { id: 'cardio',     label: '有酸素運動',            section: 'habit', timing: 'morning', isMust: true, is_active: true },
  { id: 'weight',     label: '体重測定',              section: 'body', timing: 'morning', minutes: 3, is_active: true },
  { id: 'shower',     label: 'シャワー',              section: 'body', timing: 'morning', minutes: 15, is_active: true },
  // Mind + morning
  { id: 'meditation', label: '瞑想',                  section: 'mind', timing: 'morning', minutes: 10, is_active: true },
  { id: 'motto',      label: '心得を暗唱する',        section: 'mind', timing: 'morning', minutes: 5, is_active: true },
  { id: 'tongue',     label: '舌を回す',              section: 'mind', timing: 'morning', minutes: 2, is_active: true },
  // System + morning
  { id: 'water',      label: '白湯を飲む',            section: 'system', timing: 'morning', minutes: 5, is_active: true },
  { id: 'review',     label: '前日の振り返り（やったこと・学び・Next）', section: 'system', timing: 'morning', minutes: 10, is_active: true },
  { id: 'calendar',   label: 'カレンダーを埋める',    section: 'system', timing: 'morning', minutes: 10, is_active: true },
  // Body + evening
  { id: 'weight-eve', label: '体重測定（夜）',        section: 'body', timing: 'evening', minutes: 3, is_active: true },
  // System + evening (reflection)
  { id: 'gap',        label: 'ダッシュボードのGap確認',section: 'system', timing: 'evening', minutes: 3, is_active: true },
  { id: 'update-goal',label: '目標実績を更新する',    section: 'system', timing: 'evening', minutes: 2, is_active: true },
  { id: 'insight',    label: '気づきを更新する',      section: 'system', timing: 'evening', minutes: 10, is_active: true },
  { id: 'motto-eve',  label: '心得・意識すべきことを見る', section: 'system', timing: 'evening', minutes: 2, is_active: true },
  { id: 'schedule',   label: '翌日の予定をスケジューリング（★余裕30m）', section: 'system', timing: 'evening', minutes: 10, is_active: true },
  // System + evening (prep)
  { id: 'water-prep', label: '水とコップをデスクにセット', section: 'system', timing: 'evening', is_active: true },
  { id: 'alarm',      label: 'アラームをセットして机の上に置く', section: 'system', timing: 'evening', is_active: true },
  { id: 'outer',      label: 'アウターを部屋に持ってくる', section: 'system', timing: 'evening', is_active: true },
]

export const HABIT_CATEGORIES: Array<{ id: HabitCategory; label: string; accent: string; desc: string }> = [
  { id: 'habit',    label: 'Habit',    accent: '#ff6b35', desc: '習慣化対象' },
  { id: 'growth',   label: 'Growth',   accent: '#22c55e', desc: '成長エンジン' },
  { id: 'body',     label: 'Body',     accent: '#38bdf8', desc: '身体メンテ' },
  { id: 'mind',     label: 'Mind',     accent: '#a78bfa', desc: '精神儀式' },
  { id: 'system',   label: 'System',   accent: '#f59e0b', desc: '計画・管理' },
  { id: 'task',     label: 'Task',     accent: '#94a3b8', desc: '個別タスク' },
]

export const HABIT_TIMINGS: Array<{ id: HabitTiming; label: string }> = [
  { id: 'morning', label: '朝' },
  { id: 'evening', label: '夜' },
  { id: 'anytime', label: 'いつでも' },
]

// 後方互換のために TODO_SECTIONS も残す（SettingsPage が参照するかもしれないため）
export const TODO_SECTIONS = HABIT_CATEGORIES.map(c => ({ id: c.id as HabitCategory, label: `${c.label} — ${c.desc}`, accent: c.accent }))

// 習慣化対象のデフォルト ID 集合（identity → habit 自動マイグレーション用）
const DEFAULT_HABIT_IDS = new Set<string>(['early-rise', 'training', 'english', 'side-proj', 'cardio'])

// 旧 section 値 → 新 HabitCategory のマッピング（localStorage に古いデータが残っている場合のフォールバック）
const LEGACY_SECTION_MAP: Record<string, HabitCategory> = {
  'morning-must': 'habit',
  'morning-routine': 'system',
  'evening-reflection': 'system',
  'evening-prep': 'system',
}

const VALID_CATEGORIES = new Set<string>(['habit', 'growth', 'body', 'mind', 'system', 'task'])

const resolveCategory = (section: string, id?: string): HabitCategory => {
  // 旧 'identity' データのマイグレーション: ID が習慣デフォルトに含まれれば habit、それ以外は task
  if (section === 'identity') {
    return id && DEFAULT_HABIT_IDS.has(id) ? 'habit' : 'task'
  }
  if (VALID_CATEGORIES.has(section)) return section as HabitCategory
  return LEGACY_SECTION_MAP[section] ?? 'system'
}

export const normalizeTodoDefinitions = (todos: TodoDefinition[]) =>
  todos.map(todo => ({
    ...todo,
    section: resolveCategory(todo.section, todo.id) as HabitCategory,
    timing: todo.timing ?? 'morning',
    is_active: todo.is_active ?? true,
  }))

export const useTodoDefinitions = (): readonly [
  TodoDefinition[],
  Dispatch<SetStateAction<TodoDefinition[]>>,
] => {
  const [todos, setTodos] = useLocalStorage<TodoDefinition[]>('settings:todo-definitions', DEFAULT_TODO_DEFINITIONS)
  const migratedRef = useRef(false)

  // バックグラウンドで API から取得し、localStorage と同期する
  useEffect(() => {
    fetchTodoDefinitions()
      .then(records => {
        if (records.length === 0 && !migratedRef.current) {
          // API が空 → localStorage のデータを初回マイグレーション
          migratedRef.current = true
          const localData = normalizeTodoDefinitions(todos)
          if (localData.length > 0) {
            void saveTodoDefinitions(
              localData.map((t, i) => ({
                id: t.id,
                label: t.label,
                section: t.section,
                timing: t.timing ?? 'morning',
                minutes: t.minutes ?? null,
                is_must: t.isMust ?? false,
                is_active: t.is_active,
                display_order: i,
                field_type: t.field_type ?? 'checkbox',
                field_options: (t.field_options ?? {}) as Record<string, unknown>,
              }))
            ).catch(() => {/* silent */})
          }
          return
        }
        // API にデータあり → state と localStorage を更新
        const merged: TodoDefinition[] = records.map(r => ({
          id: r.id,
          label: r.label,
          section: (r.section as HabitCategory) ?? 'system',
          timing: ((r as { timing?: string }).timing as HabitTiming) ?? 'morning',
          minutes: r.minutes ?? undefined,
          monthly_target: (r as { monthly_target?: number }).monthly_target ?? undefined,
          isMust: r.is_must ?? false,
          is_active: r.is_active,
          field_type: (r.field_type as TaskFieldType) ?? undefined,
          field_options: (r.field_options as TaskFieldOptions) ?? undefined,
        }))
        setTodos(merged)
      })
      .catch(() => {/* オフライン時は localStorage のまま継続 */})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setNormalized: Dispatch<SetStateAction<TodoDefinition[]>> = (value) => {
    const next = typeof value === 'function'
      ? normalizeTodoDefinitions((value as (prevState: TodoDefinition[]) => TodoDefinition[])(normalizeTodoDefinitions(todos)))
      : normalizeTodoDefinitions(value)

    setTodos(next)

    // API にも非同期保存（失敗しても UI には影響させない）
    void saveTodoDefinitions(
      next.map((t, i) => ({
        id: t.id,
        label: t.label,
        section: t.section,
        timing: t.timing ?? 'morning',
        minutes: t.minutes ?? null,
        monthly_target: t.monthly_target ?? null,
        is_must: t.isMust ?? false,
        is_active: t.is_active,
        display_order: i,
        field_type: t.field_type ?? 'checkbox',
        field_options: (t.field_options ?? {}) as Record<string, unknown>,
      }))
    ).catch(() => {/* silent */})
  }

  return [normalizeTodoDefinitions(todos), setNormalized] as const
}

export const bySection = (todos: TodoDefinition[], section: HabitCategory) =>
  todos.filter(todo => todo.section === section && todo.is_active)

export const bySectionAll = (todos: TodoDefinition[], section: HabitCategory) =>
  todos.filter(todo => todo.section === section)

// 新: timing でフィルタ（anytime は常に含まれる）
export const byTiming = (todos: TodoDefinition[], timing: HabitTiming) =>
  todos.filter(todo => (todo.timing === timing || todo.timing === 'anytime') && todo.is_active)

// byTiming をカテゴリでグループ化
export const byTimingGrouped = (todos: TodoDefinition[], timing: HabitTiming): Record<HabitCategory, TodoDefinition[]> => {
  const filtered = byTiming(todos, timing)
  const result: Record<HabitCategory, TodoDefinition[]> = { habit: [], growth: [], body: [], mind: [], system: [], task: [] }
  for (const todo of filtered) {
    result[resolveCategory(todo.section, todo.id)].push(todo)
  }
  return result
}

export const createTodoId = (label: string) =>
  `${label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9ぁ-んァ-ヶ一-龠ー]+/g, '-')
    .replace(/^-+|-+$/g, '')}-${Date.now().toString(36)}`
