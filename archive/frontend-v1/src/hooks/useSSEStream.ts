/**
 * GETベース SSEストリーミングカスタムフック
 * TASK-0017: Wanna Be設定・AI分析ストリーミング画面実装
 *
 * EventSource（GET）ベースの SSE 受信フック。
 * 週次レビュー（GET /ai/weekly-review/stream）など GET SSE に使用。
 * POST SSE（/wanna-be/analyze）は useWannaBeAnalysis を使用。
 *
 * 🔵 信頼性レベル: NFR-002・design-interview.md Q5 より
 */
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { AIAction } from '@/types/interfaces'

interface SSEEvent {
  type: 'chunk' | 'done' | 'error'
  content?: string
  suggested_goals?: Array<{ title: string; description: string }>
  actions?: AIAction[]
  achievement_rate?: number
  error?: string
}

interface UseSSEStreamResult {
  chunks: string[]
  isDone: boolean
  suggestedGoals: Array<{ title: string; description: string }>
  actions: AIAction[]
  achievementRate: number | null
  error: string | null
}

export function useSSEStream(url: string, enabled: boolean): UseSSEStreamResult {
  const [chunks, setChunks] = useState<string[]>([])
  const [isDone, setIsDone] = useState(false)
  const [suggestedGoals, setSuggestedGoals] = useState<
    Array<{ title: string; description: string }>
  >([])
  const [actions, setActions] = useState<AIAction[]>([])
  const [achievementRate, setAchievementRate] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !url) return

    let eventSource: EventSource | null = null
    let cancelled = false

    setChunks([])
    setIsDone(false)
    setSuggestedGoals([])
    setActions([])
    setAchievementRate(null)
    setError(null)

    const connect = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:8000'
      const resolvedUrl = new URL(url, apiBase)
      if (session?.access_token) {
        resolvedUrl.searchParams.set('token', session.access_token)
      }

      if (cancelled) return

      eventSource = new EventSource(resolvedUrl.toString(), { withCredentials: true })

      eventSource.onmessage = (e: MessageEvent) => {
        try {
          const data: SSEEvent = JSON.parse(e.data as string)

          if (data.type === 'chunk' && data.content) {
            setChunks(prev => [...prev, data.content as string])
          }
          if (data.type === 'done') {
            setIsDone(true)
            setSuggestedGoals(data.suggested_goals ?? [])
            setActions(data.actions ?? [])
            setAchievementRate(data.achievement_rate ?? null)
            eventSource?.close()
          }
          if (data.type === 'error') {
            setError(data.error ?? 'Unknown error')
            eventSource?.close()
          }
        } catch {
          // SSEパースエラーは無視
        }
      }

      eventSource.onerror = () => {
        setError('接続エラーが発生しました')
        eventSource?.close()
      }
    }

    void connect()

    return () => {
      cancelled = true
      eventSource?.close()
    }
  }, [url, enabled])

  return { chunks, isDone, suggestedGoals, actions, achievementRate, error }
}
