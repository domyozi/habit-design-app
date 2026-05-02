// ============================================================
// 旧 TodoDefinition (section='habit') と localStorage の checked データを
// /api/habits + habit_logs に移行するためのバナー。
// 完了済みフラグが立っているか、移行対象がない場合は表示しない。
// ============================================================

import { useMemo, useState } from 'react'
import {
  buildMigrationPreview,
  isMigrationDone,
  markMigrationDone,
  runMigration,
} from '@/lib/habit-migration'
import type { TodoDefinition } from '@/lib/todos'
import type { Habit } from '@/types/habit'

interface Props {
  todos: TodoDefinition[]
  setTodos: (updater: (prev: TodoDefinition[]) => TodoDefinition[]) => void | Promise<void>
  existingHabits: Habit[]
  onMigrated: () => void | Promise<void>
}

export const HabitMigrationBanner = ({ todos, setTodos, existingHabits, onMigrated }: Props) => {
  const [done, setDone] = useState(() => isMigrationDone())
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultMsg, setResultMsg] = useState<string | null>(null)

  const preview = useMemo(() => buildMigrationPreview(todos), [todos])
  const hasLegacy =
    preview.legacyHabitTitles.length > 0 || preview.totalLogCount > 0

  if (done || !hasLegacy) return null

  const handleRun = async () => {
    setRunning(true)
    setError(null)
    try {
      const result = await runMigration({
        legacyTodos: todos,
        existingHabits,
        setTodos,
      })
      setResultMsg(
        `移行しました。Habit ${result.createdHabitCount} 件、ログ ${result.loggedDayCount} 日分。`,
      )
      setDone(true)
      await onMigrated()
    } catch (err) {
      setError(err instanceof Error ? err.message : '移行に失敗しました')
    } finally {
      setRunning(false)
    }
  }

  const handleSkip = () => {
    if (!window.confirm('移行をスキップして以後表示しないようにしますか？（後で localStorage の "settings:habit-migration:done" を消すと再表示されます）')) {
      return
    }
    markMigrationDone()
    setDone(true)
  }

  if (resultMsg) {
    return (
      <div className="mx-4 mb-3 mt-2 rounded-2xl border border-[#34d399]/30 bg-[#34d399]/10 p-3 text-[12px] text-[#86efac]">
        ✓ {resultMsg}
      </div>
    )
  }

  return (
    <div className="mx-4 mb-3 mt-2 space-y-2 rounded-[20px] border border-[#fbbf24]/35 bg-[#fbbf24]/[0.07] p-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#fbbf24]">
          旧データの移行
        </p>
        <p className="mt-1 text-[12px] text-white/72">
          旧 TodoDefinition の習慣 {preview.legacyHabitTitles.length} 件と、
          ローカルに残っているチェック履歴 {preview.totalLogCount} 日分を
          バックエンドの Habit / habit_logs に移行できます。
        </p>
        {preview.legacyHabitTitles.length > 0 && (
          <p className="mt-1 text-[11px] text-white/45">
            対象: {preview.legacyHabitTitles.slice(0, 6).join(' / ')}
            {preview.legacyHabitTitles.length > 6 && ' …'}
          </p>
        )}
      </div>
      {error && (
        <p className="text-[11px] text-[#fca5a5]">エラー: {error}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleRun()}
          disabled={running}
          className="rounded-full border border-[#fbbf24]/45 bg-[#fbbf24]/15 px-3 py-1 text-[11px] font-semibold text-[#fde68a] disabled:opacity-50"
        >
          {running ? '移行中…' : '移行を実行'}
        </button>
        <button
          type="button"
          onClick={handleSkip}
          disabled={running}
          className="rounded-full border border-white/[0.1] px-3 py-1 text-[11px] text-white/55 disabled:opacity-50"
        >
          スキップ
        </button>
      </div>
    </div>
  )
}
