import { useState, useEffect, useRef, type SetStateAction } from 'react'

// 今日の日付キー（YYYY-MM-DD）
export const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 新スキーマキー: daily:{date}:{slot}:{field}
export const dailyStorageKey = (slot: 'morning' | 'evening', field: string, date?: string) =>
  `daily:${date ?? todayKey()}:${slot}:${field}`

// 型付き localStorage 読み書き
const get = <T>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key)
    return v !== null ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

const set = <T>(key: string, value: T) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // quota exceeded — silent
  }
}

// 汎用 hook
export function useLocalStorage<T>(key: string, fallback: T) {
  const [state, setState] = useState<T>(() => get(key, fallback))
  const syncedKeyRef = useRef(key)

  const setAndSync = (value: SetStateAction<T>) => {
    setState(prev => {
      const next = typeof value === 'function'
        ? (value as (prevState: T) => T)(prev)
        : value
      set(key, next)
      window.dispatchEvent(new CustomEvent('local-storage', { detail: { key } }))
      return next
    })
  }

  useEffect(() => {
    if (syncedKeyRef.current !== key) {
      syncedKeyRef.current = key
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(get(key, fallback))
      return
    }

    set(key, state)
  }, [fallback, key, state])

  useEffect(() => {
    const syncIfKeyMatches = (changedKey?: string) => {
      if (!changedKey || changedKey === key) {
        setState(get(key, fallback))
      }
    }

    const handleStorage = (event: StorageEvent) => {
      syncIfKeyMatches(event.key ?? undefined)
    }

    const handleCustom = (event: Event) => {
      const customEvent = event as CustomEvent<{ key?: string }>
      syncIfKeyMatches(customEvent.detail?.key)
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('local-storage', handleCustom)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('local-storage', handleCustom)
    }
  }, [fallback, key])

  return [state, setAndSync] as const
}

// 今日付きキーの hook（日付が変わると自動リセット）
export function useTodayStorage<T>(prefix: string, fallback: T) {
  const key = `${prefix}:${todayKey()}`
  return useLocalStorage(key, fallback)
}

// 今月の日付キー一覧（YYYY-MM-DD）
export const thisMonthKeys = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const daysToday = today.getDate()
  return Array.from({ length: daysToday }, (_, i) => {
    const d = i + 1
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  })
}

// 今月の習慣別チェック数を集計
// prefix: 'morning:checked' など（新旧両スキーマを参照）
export const countMonthlyChecks = (prefix: string): Record<string, number> => {
  const result: Record<string, number> = {}
  const [slot, ...rest] = prefix.split(':')
  const field = rest.join(':')

  for (const dateKey of thisMonthKeys()) {
    // 新スキーマ: daily:{date}:{slot}:{field}
    const newKey = `daily:${dateKey}:${slot}:${field}`
    // 旧スキーマ: {slot}:{field}:{date}
    const oldKey = `${prefix}:${dateKey}`

    const raw = localStorage.getItem(newKey) ?? localStorage.getItem(oldKey)
    const checked: string[] = raw ? (JSON.parse(raw) as string[]) : []
    for (const id of checked) {
      result[id] = (result[id] ?? 0) + 1
    }
  }
  return result
}

// 昨日のキーを返す
export const yesterdayKey = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 新スキーマ: daily:{date}:{slot}:{field} で保存するフック
// 旧スキーマのキーからマイグレーション読み込みも行う
export function useDailyStorage<T>(
  slot: 'morning' | 'evening',
  field: string,
  fallback: T,
  /** 省略時は今日。過去日付を渡すと読み取り専用になる（localStorage への書き戻しなし） */
  dateOverride?: string,
) {
  const dateKey = dateOverride ?? todayKey()
  const isToday = dateKey === todayKey()
  const newKey = `daily:${dateKey}:${slot}:${field}`
  const oldKey = `${slot}:${field}:${dateKey}`
  const syncedKeyRef = useRef(newKey)

  const init = (): T => {
    const rawNew = localStorage.getItem(newKey)
    if (rawNew !== null) return JSON.parse(rawNew) as T
    const rawOld = localStorage.getItem(oldKey)
    if (rawOld !== null) return JSON.parse(rawOld) as T
    return fallback
  }

  const [state, setState] = useState<T>(init)

  const setAndSync = (value: SetStateAction<T>) => {
    setState(prev => {
      const next = typeof value === 'function'
        ? (value as (prevState: T) => T)(prev)
        : value

      if (isToday) {
        set(newKey, next)
        window.dispatchEvent(new CustomEvent('local-storage', { detail: { key: newKey } }))
      }

      return next
    })
  }

  useEffect(() => {
    if (syncedKeyRef.current !== newKey) {
      syncedKeyRef.current = newKey

      const rawNew = localStorage.getItem(newKey)
      if (rawNew !== null) {
        setState(JSON.parse(rawNew) as T)
        return
      }

      const rawOld = localStorage.getItem(oldKey)
      if (rawOld !== null) {
        setState(JSON.parse(rawOld) as T)
        return
      }

      setState(fallback)
      return
    }

    // 今日の場合のみ localStorage に書き戻す（過去日付は読み取り専用）
    if (isToday) set(newKey, state)
  }, [fallback, isToday, newKey, oldKey, state])

  useEffect(() => {
    const syncIfKeyMatches = (changedKey?: string) => {
      if (!changedKey || changedKey === newKey) {
        setState(init())
      }
    }

    const handleStorage = (event: StorageEvent) => {
      syncIfKeyMatches(event.key ?? undefined)
    }

    const handleCustom = (event: Event) => {
      const customEvent = event as CustomEvent<{ key?: string }>
      syncIfKeyMatches(customEvent.detail?.key)
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('local-storage', handleCustom)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('local-storage', handleCustom)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newKey])

  return [state, setAndSync] as const
}

// 今月のキー（YYYY-MM）
export const thisMonthKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 先月の全日付キー（YYYY-MM-DD）
export const lastMonthKeys = () => {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth() // 0-indexed: 先月は m-1+1 = m
  const lastMonthDate = new Date(y, m, 0) // 先月末日
  const daysInLastMonth = lastMonthDate.getDate()
  const lastM = lastMonthDate.getMonth() + 1
  const lastY = lastMonthDate.getFullYear()
  return Array.from({ length: daysInLastMonth }, (_, i) => {
    const d = i + 1
    return `${lastY}-${String(lastM).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  })
}

// 指定日付キー一覧から習慣別チェック数を集計（新旧スキーマ対応）
export const countChecksForDates = (slot: 'morning' | 'evening', field: string, dateKeys: string[]): Record<string, number> => {
  const result: Record<string, number> = {}
  for (const dateKey of dateKeys) {
    const newKey = `daily:${dateKey}:${slot}:${field}`
    const oldKey = `${slot}:${field}:${dateKey}`
    const raw = localStorage.getItem(newKey) ?? localStorage.getItem(oldKey)
    const checked: string[] = raw ? JSON.parse(raw) : []
    for (const id of checked) {
      result[id] = (result[id] ?? 0) + 1
    }
  }
  return result
}

// 週別集計（今月を W1〜W4 に分割）
export const countByWeek = (slot: 'morning' | 'evening', field: string): Record<string, Record<string, number>> => {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const daysToday = today.getDate()
  const monthStr = String(month + 1).padStart(2, '0')

  const weeks: Record<string, Record<string, number>> = { W1: {}, W2: {}, W3: {}, W4: {} }

  for (let d = 1; d <= daysToday; d++) {
    const weekIdx = Math.ceil(d / 7)
    const weekKey = weekIdx <= 4 ? `W${weekIdx}` : 'W4'
    const dateKey = `${year}-${monthStr}-${String(d).padStart(2, '0')}`
    const newKey = `daily:${dateKey}:${slot}:${field}`
    const oldKey = `${slot}:${field}:${dateKey}`
    const raw = localStorage.getItem(newKey) ?? localStorage.getItem(oldKey)
    const checked: string[] = raw ? JSON.parse(raw) : []
    for (const id of checked) {
      weeks[weekKey][id] = (weeks[weekKey][id] ?? 0) + 1
    }
  }
  return weeks
}

// 月別集計（指定年の 1〜12 月を返す）
export const countByMonth = (slot: 'morning' | 'evening', field: string, year = new Date().getFullYear()): Record<string, Record<string, number>> => {
  const result: Record<string, Record<string, number>> = {}
  const yearPrefix = `${year}-`

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue

    const newMatch = new RegExp(`^daily:(${yearPrefix}\\d{2}-\\d{2}):${slot}:${field}$`).exec(key)
    const oldMatch = new RegExp(`^${slot}:${field}:(${yearPrefix}\\d{2}-\\d{2})$`).exec(key)
    const dateKey = newMatch?.[1] ?? oldMatch?.[1]
    if (!dateKey) continue

    const monthKey = dateKey.slice(5, 7)
    const raw = localStorage.getItem(key)
    if (!raw) continue

    const checked: string[] = JSON.parse(raw)
    if (!result[monthKey]) result[monthKey] = {}
    for (const id of checked) {
      result[monthKey][id] = (result[monthKey][id] ?? 0) + 1
    }
  }

  return result
}

// 月次目標（monthly:{YYYY-MM}:targets → Record<habitId, number>）
export function useMonthlyTargets(defaults: Record<string, number> = {}) {
  const key = `monthly:${thisMonthKey()}:targets`
  return useLocalStorage<Record<string, number>>(key, defaults)
}

// 全期間ベスト月次達成数（履歴ローカルを走査して最高月次を返す）
export const getAllTimeBests = (): Record<string, number> => {
  const monthCounts: Record<string, Record<string, number>> = {}

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue

    // 新スキーマ: daily:{YYYY-MM-DD}:morning:checked
    const newMatch = /^daily:(\d{4}-\d{2})-\d{2}:morning:checked$/.exec(key)
    // 旧スキーマ: morning:checked:{YYYY-MM-DD}
    const oldMatch = /^morning:checked:(\d{4}-\d{2})-\d{2}$/.exec(key)

    const month = newMatch?.[1] ?? oldMatch?.[1]
    if (!month) continue

    const raw = localStorage.getItem(key)
    if (!raw) continue
    const checked: string[] = JSON.parse(raw)

    if (!monthCounts[month]) monthCounts[month] = {}
    for (const id of checked) {
      monthCounts[month][id] = (monthCounts[month][id] ?? 0) + 1
    }
  }

  const bests: Record<string, number> = {}
  for (const counts of Object.values(monthCounts)) {
    for (const [id, count] of Object.entries(counts)) {
      if ((bests[id] ?? 0) < count) bests[id] = count
    }
  }
  return bests
}

// 過去N日分の日次フィールドを読み込む（数値・文字列どちらでも）
export const readDailyField = (
  slot: 'morning' | 'evening',
  field: string,
  nDays: number,
): Array<{ date: string; value: string | null }> => {
  return Array.from({ length: nDays }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (nDays - 1 - i))
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const key = `daily:${dateKey}:${slot}:${field}`
    const raw = localStorage.getItem(key)
    return { date: dateKey, value: raw !== null ? (JSON.parse(raw) as string) : null }
  })
}

// ボス用: { value, date } で保存し、今日 or 昨日のものだけ返す
export interface BossData {
  value: string
  date: string
  completed: boolean
}

export function useBossStorage() {
  const [data, setData] = useLocalStorage<BossData | null>('daily-os:boss', null)

  const isValid = data && (data.date === todayKey() || data.date === yesterdayKey())
  const boss = isValid ? data : null

  const setBoss = (value: string) =>
    setData({ value, date: todayKey(), completed: false })

  const clearBoss = () => setData(null)

  const toggleCompleted = () => {
    if (!data) return
    setData({ ...data, completed: !data.completed })
  }

  return { boss, setBoss, clearBoss, toggleCompleted }
}
