import { useState, useEffect } from 'react'

export type TimePeriod = 'morning' | 'evening' | 'other'

export interface TimeContext {
  period: TimePeriod
  hour: number
  label: string
  greeting: string
}

const getPeriod = (hour: number): TimePeriod => {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 17 && hour < 24) return 'evening'
  return 'other'
}

const getLabel = (period: TimePeriod): string => {
  switch (period) {
    case 'morning': return '朝のルーティンタイム'
    case 'evening': return '夜の振り返りタイム'
    default: return '今日のまとめ'
  }
}

const getGreeting = (period: TimePeriod): string => {
  switch (period) {
    case 'morning': return 'おはようございます'
    case 'evening': return 'おつかれさまです'
    default: return 'こんにちは'
  }
}

export const getTimeContext = (): TimeContext => {
  const hour = new Date().getHours()
  const period = getPeriod(hour)
  return {
    period,
    hour,
    label: getLabel(period),
    greeting: getGreeting(period),
  }
}

export const useTimeContext = (): TimeContext => {
  const [ctx, setCtx] = useState<TimeContext>(getTimeContext)

  // 1分ごとに再評価（時刻帯をまたいだとき自動更新）
  useEffect(() => {
    const id = setInterval(() => setCtx(getTimeContext()), 60_000)
    return () => clearInterval(id)
  }, [])

  return ctx
}
