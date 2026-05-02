// ============================================================
// useHabits — /api/habits を扱う共通フック
//
// 設定画面・レコード画面・分析画面で共通に使う。
// 楽観的更新は最小限に留めて、サーバー応答で state を上書きする。
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { createHabit, deleteHabit, getHabits, updateHabit } from './api'
import type { CreateHabitRequest, Habit, UpdateHabitRequest } from '@/types/habit'

export interface UseHabitsResult {
  habits: Habit[]
  loading: boolean
  error: Error | null
  refresh: () => Promise<void>
  add: (req: CreateHabitRequest) => Promise<Habit>
  update: (id: string, req: UpdateHabitRequest) => Promise<Habit>
  remove: (id: string) => Promise<void>
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

  return { habits, loading, error, refresh, add, update, remove }
}
