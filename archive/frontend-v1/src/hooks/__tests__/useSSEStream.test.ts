/**
 * useSSEStream.ts テスト
 * TASK-0017: Wanna Be設定・AI分析ストリーミング画面実装
 *
 * テストケース:
 * 1. enabled=false のとき EventSource を作成しない
 * 2. chunk イベントで chunks 配列が更新される
 * 3. done イベントで isDone=true, suggestedGoals が設定される
 * 4. error イベントで error が設定される
 *
 * 🔵 信頼性レベル: NFR-002・design-interview.md Q5 より
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSSEStream } from '@/hooks/useSSEStream'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
        error: null,
      }),
    },
  },
}))

/** EventSource モッククラス */
class MockEventSource {
  static instances: MockEventSource[] = []
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  close = vi.fn()

  constructor(public url: string, public options?: EventSourceInit) {
    MockEventSource.instances.push(this)
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent)
  }
}

describe('useSSEStream', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /**
   * テストケース1: enabled=false のとき EventSource を作成しない
   */
  it('enabled=false のとき EventSource を作成しない', () => {
    renderHook(() => useSSEStream('http://localhost:8000/test', false))
    expect(MockEventSource.instances).toHaveLength(0)
  })

  /**
   * テストケース2: chunk イベントで chunks が更新される
   * Given: enabled=true で EventSource が接続されている
   * When: type="chunk" のメッセージが届く
   * Then: chunks 配列にコンテンツが追加される
   * 🔵 NFR-002 より
   */
  it('chunk イベントで chunks 配列が更新される', async () => {
    const { result } = renderHook(() =>
      useSSEStream('http://localhost:8000/test', true)
    )

    await waitFor(() => {
      expect(MockEventSource.instances).toHaveLength(1)
    })
    const source = MockEventSource.instances[0]
    expect(source.url).toContain('token=test-token')

    act(() => {
      source.emit({ type: 'chunk', content: '今週は' })
      source.emit({ type: 'chunk', content: '良い調子です' })
    })

    expect(result.current.chunks).toEqual(['今週は', '良い調子です'])
  })

  /**
   * テストケース3: done イベントで isDone=true, suggestedGoals が設定される
   * Given: EventSource が接続されている
   * When: type="done" のメッセージが届く
   * Then: isDone=true, suggestedGoals に候補が設定される
   * 🔵 REQ-203 より
   */
  it('done イベントで isDone=true と actions が設定される', async () => {
    const { result } = renderHook(() =>
      useSSEStream('http://localhost:8000/test', true)
    )

    await waitFor(() => {
      expect(MockEventSource.instances).toHaveLength(1)
    })
    const source = MockEventSource.instances[0]
    const actions = [
      { action_type: 'change_time', habit_id: 'habit-1', params: { time: '06:30' } },
      { action_type: 'add_habit', params: { title: '瞑想5分' } },
    ]

    act(() => {
      source.emit({ type: 'done', actions, achievement_rate: 84 })
    })

    expect(result.current.isDone).toBe(true)
    expect(result.current.actions).toEqual(actions)
    expect(result.current.achievementRate).toBe(84)
    expect(source.close).toHaveBeenCalled()
  })

  /**
   * テストケース4: error イベントで error が設定される
   * Given: EventSource が接続されている
   * When: type="error" のメッセージが届く
   * Then: error に文字列が設定される
   * 🔵 EDGE-001 より
   */
  it('error イベントで error が設定される', async () => {
    const { result } = renderHook(() =>
      useSSEStream('http://localhost:8000/test', true)
    )

    await waitFor(() => {
      expect(MockEventSource.instances).toHaveLength(1)
    })
    const source = MockEventSource.instances[0]

    act(() => {
      source.emit({ type: 'error', error: 'AI_UNAVAILABLE' })
    })

    expect(result.current.error).toBe('AI_UNAVAILABLE')
    expect(source.close).toHaveBeenCalled()
  })
})
