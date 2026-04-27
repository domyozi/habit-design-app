import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useRef } from 'react'
import { useLocalStorage } from '@/lib/storage'
import { fetchTodoDefinitions, saveTodoDefinitions } from '@/lib/api'

export type TodoSection = 'morning-must' | 'morning-routine' | 'evening-reflection' | 'evening-prep'

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
  section: TodoSection
  minutes?: number
  isMust?: boolean
  is_active: boolean
  field_type?: TaskFieldType
  field_options?: TaskFieldOptions
}

export const DEFAULT_TODO_DEFINITIONS: TodoDefinition[] = [
  { id: 'early-rise', label: '早起き（5時台起床）', section: 'morning-must', isMust: true, is_active: true },
  { id: 'training', label: '筋トレ', section: 'morning-must', isMust: true, is_active: true },
  { id: 'english', label: '英語学習', section: 'morning-must', isMust: true, is_active: true },
  { id: 'side-proj', label: '副業推進', section: 'morning-must', isMust: true, is_active: true },
  { id: 'cardio', label: '有酸素運動', section: 'morning-must', isMust: true, is_active: true },
  { id: 'water', label: '白湯を飲む', section: 'morning-routine', minutes: 5, is_active: true },
  { id: 'review', label: '前日の振り返り（やったこと・学び・Next）', section: 'morning-routine', minutes: 10, is_active: true },
  { id: 'weight', label: '体重測定', section: 'morning-routine', minutes: 3, is_active: true },
  { id: 'calendar', label: 'カレンダーを埋める', section: 'morning-routine', minutes: 10, is_active: true },
  { id: 'shower', label: 'シャワー', section: 'morning-routine', minutes: 15, is_active: true },
  { id: 'meditation', label: '瞑想', section: 'morning-routine', minutes: 10, is_active: true },
  { id: 'motto', label: '心得を暗唱する', section: 'morning-routine', minutes: 5, is_active: true },
  { id: 'tongue', label: '舌を回す', section: 'morning-routine', minutes: 2, is_active: true },
  { id: 'weight-eve', label: '体重測定（夜）', section: 'evening-reflection', minutes: 3, is_active: true },
  { id: 'gap', label: 'ダッシュボードのGap確認', section: 'evening-reflection', minutes: 3, is_active: true },
  { id: 'update-goal', label: '目標実績を更新する', section: 'evening-reflection', minutes: 2, is_active: true },
  { id: 'insight', label: '気づきを更新する', section: 'evening-reflection', minutes: 10, is_active: true },
  { id: 'motto-eve', label: '心得・意識すべきことを見る', section: 'evening-reflection', minutes: 2, is_active: true },
  { id: 'schedule', label: '翌日の予定をスケジューリング（★余裕30m）', section: 'evening-reflection', minutes: 10, is_active: true },
  { id: 'water-prep', label: '水とコップをデスクにセット', section: 'evening-prep', is_active: true },
  { id: 'alarm', label: 'アラームをセットして机の上に置く', section: 'evening-prep', is_active: true },
  { id: 'outer', label: 'アウターを部屋に持ってくる', section: 'evening-prep', is_active: true },
]

export const TODO_SECTIONS: Array<{ id: TodoSection; label: string; accent: string }> = [
  { id: 'morning-must', label: '朝の MUST', accent: '#ff6b35' },
  { id: 'morning-routine', label: '朝のルーティン', accent: '#f59e0b' },
  { id: 'evening-reflection', label: '夜の振り返り', accent: '#a78bfa' },
  { id: 'evening-prep', label: '夜の準備', accent: '#38bdf8' },
]

export const normalizeTodoDefinitions = (todos: TodoDefinition[]) =>
  todos.map(todo => ({
    ...todo,
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
          section: r.section as TodoSection,
          minutes: r.minutes ?? undefined,
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
        minutes: t.minutes ?? null,
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

export const bySection = (todos: TodoDefinition[], section: TodoSection) =>
  todos.filter(todo => todo.section === section && todo.is_active)

export const bySectionAll = (todos: TodoDefinition[], section: TodoSection) =>
  todos.filter(todo => todo.section === section)

export const createTodoId = (label: string) =>
  `${label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9ぁ-んァ-ヶ一-龠ー]+/g, '-')
    .replace(/^-+|-+$/g, '')}-${Date.now().toString(36)}`
