/**
 * Wanna Be AI分析ストリーミングフック
 * TASK-0017: Wanna Be設定・AI分析ストリーミング画面実装
 *
 * POST /api/wanna-be/analyze の SSE レスポンスを fetch + ReadableStream で受信。
 * EventSource は POST をサポートしないため fetch を使用。
 *
 * 🔵 信頼性レベル: REQ-201/203・NFR-002・EDGE-001 より
 */
import { useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export interface SuggestedGoal {
  title: string
  description: string
}

export interface UseWannaBeAnalysisResult {
  isStreaming: boolean
  streamedText: string
  isDone: boolean
  suggestedGoals: SuggestedGoal[]
  error: string | null
  startAnalysis: (text: string) => Promise<void>
  reset: () => void
}

export function useWannaBeAnalysis(): UseWannaBeAnalysisResult {
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamedText, setStreamedText] = useState('')
  const [isDone, setIsDone] = useState(false)
  const [suggestedGoals, setSuggestedGoals] = useState<SuggestedGoal[]>([])
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const reset = useCallback(() => {
    setIsStreaming(false)
    setStreamedText('')
    setIsDone(false)
    setSuggestedGoals([])
    setError(null)
  }, [])

  const startAnalysis = useCallback(
    async (text: string) => {
      abortRef.current?.abort()
      const abort = new AbortController()
      abortRef.current = abort

      reset()
      setIsStreaming(true)

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`
        }

        const response = await fetch(`${API_BASE_URL}/api/wanna-be/analyze`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ text }),
          signal: abort.signal,
        })

        if (!response.ok || !response.body) {
          // AI_UNAVAILABLE の場合もテキスト保存は行われている（バックエンド側で処理済み）
          setError('AI_UNAVAILABLE')
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const event = JSON.parse(line.slice(6)) as {
                type: string
                content?: string
                suggested_goals?: SuggestedGoal[]
                error?: string
              }

              if (event.type === 'chunk' && event.content) {
                setStreamedText(prev => prev + event.content)
              }
              if (event.type === 'done') {
                setIsDone(true)
                setSuggestedGoals(event.suggested_goals ?? [])
              }
              if (event.type === 'error') {
                setError(event.error ?? 'AI_UNAVAILABLE')
              }
            } catch {
              // SSEパースエラーは無視
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError('AI_UNAVAILABLE')
        }
      } finally {
        if (!abort.signal.aborted) {
          setIsStreaming(false)
        }
      }
    },
    [reset]
  )

  return { isStreaming, streamedText, isDone, suggestedGoals, error, startAnalysis, reset }
}
