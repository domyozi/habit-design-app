import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useRef } from 'react'
import { useLocalStorage } from '@/lib/storage'
import { fetchTodoDefinitions, saveTodoDefinitions } from '@/lib/api'

// 旧 6 カテゴリ（habit / growth / body / mind / system / task）は廃止し、`habit` のみに集約。
// 既存 DB 行で他カテゴリ値が残っている場合は resolveCategory で 'habit' に正規化する。
export type HabitCategory = 'habit'
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

// 新規ユーザ向けデフォルトは「習慣化（朝のチェック項目）」のみ。
// 既存ユーザの local データにある旧カテゴリ値は normalize で 'habit' に集約される。
export const DEFAULT_TODO_DEFINITIONS: TodoDefinition[] = [
  { id: 'early-rise', label: '早起き（5時台起床）', section: 'habit', timing: 'morning', isMust: true, is_active: true },
  { id: 'training',   label: '筋トレ',               section: 'habit', timing: 'morning', isMust: true, is_active: true },
  { id: 'english',    label: '英語学習',              section: 'habit', timing: 'morning', isMust: true, is_active: true },
  { id: 'side-proj',  label: '副業推進',              section: 'habit', timing: 'morning', isMust: true, is_active: true },
  { id: 'cardio',     label: '有酸素運動',            section: 'habit', timing: 'morning', isMust: true, is_active: true },
]

export const HABIT_CATEGORIES: Array<{ id: HabitCategory; label: string; accent: string; desc: string }> = [
  { id: 'habit', label: 'Habit', accent: '#ff6b35', desc: '習慣化対象' },
]

export const HABIT_TIMINGS: Array<{ id: HabitTiming; label: string }> = [
  { id: 'morning', label: '朝' },
  { id: 'evening', label: '夜' },
  { id: 'anytime', label: 'いつでも' },
]

// 後方互換のために TODO_SECTIONS も残す（SettingsPage が参照するかもしれないため）
export const TODO_SECTIONS = HABIT_CATEGORIES.map(c => ({ id: c.id as HabitCategory, label: `${c.label} — ${c.desc}`, accent: c.accent }))

// 旧カテゴリ値（growth / body / mind / system / task / identity / morning-must 等）はすべて 'habit' に正規化する。
// バックエンドのマイグレーションで DB は揃うが、フロントの localStorage や旧 API レスポンスへの保険として残す。
const resolveCategory = (_section: string, _id?: string): HabitCategory => 'habit'

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
          section: resolveCategory(r.section ?? '', r.id),
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

// byTiming をカテゴリでグループ化（カテゴリは 'habit' に集約済みなので実質単一バケット）
export const byTimingGrouped = (todos: TodoDefinition[], timing: HabitTiming): Record<HabitCategory, TodoDefinition[]> => {
  const filtered = byTiming(todos, timing)
  const result: Record<HabitCategory, TodoDefinition[]> = { habit: [] }
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
