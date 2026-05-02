// ============================================================
// 旧 TodoDefinition (section='habit') と localStorage チェック履歴を
// バックエンドの habits / habit_logs テーブルに移行するワンショット
// スクリプト。
//
// 移行ルール:
//   - section='habit' && is_active を Habit として INSERT（binary 型）。
//     既存タイトルと重複する Habit が API 側にあればスキップ。
//   - localStorage の `daily:{YYYY-MM-DD}:morning:checked` および旧形式
//     `morning:checked:{YYYY-MM-DD}` を走査し、配列に含まれる旧 id を
//     新規 Habit にマッピングして PATCH /api/habits/{id}/log。
//   - 移行が成功した旧 TodoDefinition の habit 行は is_active=false に
//     して画面から消す。
//
// 完了後は localStorage に done フラグを書く。再実行はそのフラグを手動
// で消すまで起きない。
// ============================================================

import type { TodoDefinition } from './todos'
import { createHabit, logHabit } from './api'
import type { Habit } from '@/types/habit'

const FLAG_KEY = 'settings:habit-migration:done'

export interface MigrationPreview {
  legacyHabitTitles: string[]
  /** legacyId → 完了日(YYYY-MM-DD)の集合 */
  legacyLogsByHabitId: Map<string, Set<string>>
  totalLogCount: number
}

export interface MigrationResult {
  createdHabitCount: number
  loggedDayCount: number
  hiddenLegacyIds: string[]
}

export const isMigrationDone = (): boolean => {
  try {
    return localStorage.getItem(FLAG_KEY) === 'true'
  } catch {
    return false
  }
}

export const markMigrationDone = (): void => {
  try {
    localStorage.setItem(FLAG_KEY, 'true')
  } catch {
    /* ignore */
  }
}

/** 旧 habit カテゴリの TodoDefinition を抽出（is_active のもののみ） */
export const collectLegacyHabits = (todos: TodoDefinition[]): TodoDefinition[] =>
  todos.filter((t) => t.section === 'habit' && t.is_active !== false)

/**
 * localStorage から `daily:{date}:morning:checked` と
 * `morning:checked:{date}` を全部走査し、id → Set<date> の map を返す。
 * legacyHabits に含まれない id は無視する。
 */
export const collectLegacyLogs = (
  legacyHabits: TodoDefinition[],
): Map<string, Set<string>> => {
  const allowed = new Set(legacyHabits.map((t) => t.id))
  const result = new Map<string, Set<string>>()

  const ingest = (date: string, raw: string | null) => {
    if (!raw) return
    let arr: unknown
    try {
      arr = JSON.parse(raw)
    } catch {
      return
    }
    if (!Array.isArray(arr)) return
    for (const id of arr) {
      if (typeof id !== 'string') continue
      if (!allowed.has(id)) continue
      if (!result.has(id)) result.set(id, new Set())
      result.get(id)!.add(date)
    }
  }

  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key) continue
      let m = key.match(/^daily:(\d{4}-\d{2}-\d{2}):morning:checked$/)
      if (m) {
        ingest(m[1], localStorage.getItem(key))
        continue
      }
      m = key.match(/^morning:checked:(\d{4}-\d{2}-\d{2})$/)
      if (m) ingest(m[1], localStorage.getItem(key))
    }
  } catch {
    /* ignore */
  }
  return result
}

export const buildMigrationPreview = (
  todos: TodoDefinition[],
): MigrationPreview => {
  const legacy = collectLegacyHabits(todos)
  const logs = collectLegacyLogs(legacy)
  const totalLogCount = Array.from(logs.values()).reduce(
    (sum, set) => sum + set.size,
    0,
  )
  return {
    legacyHabitTitles: legacy.map((t) => t.label),
    legacyLogsByHabitId: logs,
    totalLogCount,
  }
}

/**
 * 実際の移行処理。createHabit / logHabit / setTodos を引数として受け取り、
 * テスト容易性を確保する。
 */
export const runMigration = async (params: {
  legacyTodos: TodoDefinition[]
  existingHabits: Habit[]
  setTodos: (
    updater: (prev: TodoDefinition[]) => TodoDefinition[],
  ) => void | Promise<void>
}): Promise<MigrationResult> => {
  const legacy = collectLegacyHabits(params.legacyTodos)
  const logs = collectLegacyLogs(legacy)

  // legacyId → habitId （新規作成 or 既存とのマッチ）
  const idMap = new Map<string, string>()
  let createdCount = 0
  for (const t of legacy) {
    const sameTitle = params.existingHabits.find(
      (h) => h.title.trim() === t.label.trim() && h.is_active,
    )
    if (sameTitle) {
      idMap.set(t.id, sameTitle.id)
      continue
    }
    try {
      const created = await createHabit({
        title: t.label,
        metric_type: 'binary',
      })
      idMap.set(t.id, created.id)
      createdCount += 1
    } catch {
      // 失敗したらこの legacy はスキップ
    }
  }

  // logs を順次 upsert
  let loggedCount = 0
  for (const [legacyId, dates] of logs) {
    const habitId = idMap.get(legacyId)
    if (!habitId) continue
    for (const date of dates) {
      try {
        await logHabit(habitId, { date, completed: true, input_method: 'manual' })
        loggedCount += 1
      } catch {
        /* ignore individual failures */
      }
    }
  }

  // 旧 habit 行を非表示にする
  const hiddenIds = legacy.map((t) => t.id)
  await Promise.resolve(
    params.setTodos((prev) =>
      prev.map((t) =>
        hiddenIds.includes(t.id) ? { ...t, is_active: false } : t,
      ),
    ),
  )

  markMigrationDone()
  return {
    createdHabitCount: createdCount,
    loggedDayCount: loggedCount,
    hiddenLegacyIds: hiddenIds,
  }
}
