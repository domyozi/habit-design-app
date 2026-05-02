// ============================================================
// useHabits — /api/habits を扱う共通フック
//
// 設定画面・レコード画面・分析画面で共通に使う。
// 楽観的更新は最小限に留めて、サーバー応答で state を上書きする。
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import {
  createHabit,
  deleteHabit,
  getHabits,
  logHabit,
  updateHabit,
} from './api'
import type {
  CreateHabitRequest,
  Habit,
  HabitLog,
  UpdateHabitLogRequest,
  UpdateHabitRequest,
} from '@/types/habit'

export interface UseHabitsResult {
  habits: Habit[]
  loading: boolean
  error: Error | null
  refresh: () => Promise<void>
  add: (req: CreateHabitRequest) => Promise<Habit>
  update: (id: string, req: UpdateHabitRequest) => Promise<Habit>
  remove: (id: string) => Promise<void>
  /**
   * /api/habits/{id}/log を楽観更新で叩く。
   * 1) 即座に setHabits で today_log を反映（UI 即時）
   * 2) サーバー応答で today_log と current_streak を確定値に上書き
   * 3) 失敗したら refresh で巻き戻し（throw もする）
   */
  recordLog: (id: string, req: UpdateHabitLogRequest) => Promise<void>
  /**
   * 渡された id 順で display_order を 0,1,2,... に振り直して
   * サーバーに反映する。並列 PATCH で送信し、失敗時は refresh で巻き戻し。
   */
  reorder: (orderedIds: string[]) => Promise<void>
}

const buildOptimisticLog = (h: Habit, req: UpdateHabitLogRequest): HabitLog => {
  const prev = h.today_log
  return {
    id: prev?.id ?? `optimistic-${h.id}-${req.date}`,
    habit_id: h.id,
    user_id: h.user_id,
    log_date: req.date,
    completed: req.completed,
    completed_at: prev?.completed_at ?? null,
    input_method: req.input_method ?? prev?.input_method ?? null,
    numeric_value:
      req.numeric_value !== undefined
        ? req.numeric_value
        : prev?.numeric_value ?? null,
    time_value:
      req.time_value !== undefined ? req.time_value : prev?.time_value ?? null,
    created_at: prev?.created_at ?? new Date().toISOString(),
  }
}

export const useHabits = (): UseHabitsResult => {
  const [habits, setHabits] = useState<Habit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getHabits()
      setHabits(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const add = useCallback(async (req: CreateHabitRequest) => {
    const created = await createHabit(req)
    setHabits((prev) => [...prev, created])
    return created
  }, [])

  const update = useCallback(async (id: string, req: UpdateHabitRequest) => {
    const updated = await updateHabit(id, req)
    setHabits((prev) => prev.map((h) => (h.id === id ? updated : h)))
    return updated
  }, [])

  const remove = useCallback(async (id: string) => {
    await deleteHabit(id)
    setHabits((prev) => prev.filter((h) => h.id !== id))
  }, [])

  const recordLog = useCallback(
    async (id: string, req: UpdateHabitLogRequest) => {
      // (a) Optimistic — 即座に UI を反映
      setHabits((prev) =>
        prev.map((h) =>
          h.id === id ? { ...h, today_log: buildOptimisticLog(h, req) } : h,
        ),
      )

      try {
        const result = await logHabit(id, req)
        // (b) サーバー応答で確定値に上書き
        setHabits((prev) =>
          prev.map((h) => {
            if (h.id !== id) return h
            const serverLog = (result.log as HabitLog | undefined) ?? h.today_log
            return {
              ...h,
              today_log: serverLog,
              current_streak:
                typeof result.streak === 'number'
                  ? result.streak
                  : h.current_streak,
            }
          }),
        )
      } catch (err) {
        // (c) 失敗 — サーバーから再取得して巻き戻す
        void refresh()
        throw err
      }
    },
    [refresh],
  )

  const reorder = useCallback(
    async (orderedIds: string[]) => {
      // 楽観: 渡された順番で display_order を 0..n-1 に振り直す
      setHabits((prev) => {
        const map = new Map(prev.map((h) => [h.id, h]))
        const reordered: Habit[] = []
        orderedIds.forEach((id, i) => {
          const h = map.get(id)
          if (h) reordered.push({ ...h, display_order: i })
        })
        // orderedIds に含まれない（= 並び替え対象外の）habit は末尾に温存
        for (const h of prev) {
          if (!orderedIds.includes(h.id)) reordered.push(h)
        }
        return reordered
      })

      try {
        await Promise.all(
          orderedIds.map((id, i) =>
            updateHabit(id, { action: 'manual_edit', display_order: i }),
          ),
        )
      } catch (err) {
        void refresh()
        throw err
      }
    },
    [refresh],
  )

  return {
    habits,
    loading,
    error,
    refresh,
    add,
    update,
    remove,
    recordLog,
    reorder,
  }
}
