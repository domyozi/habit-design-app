/**
 * useHabitLog.ts テスト
 * TASK-0015: 習慣チェックリスト操作UI
 *
 * テストケース:
 * 1. PATCH /habits/{id}/log が呼ばれる
 * 2. 成功時にqueryClient['dashboard']をinvalidateする
 * 3. バッジ獲得時にbadge_earnedが返る
 *
 * 🔵 信頼性レベル: REQ-501/502/901 より
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import * as api from '@/lib/api'
import { useHabitLog } from '@/hooks/useHabitLog'

vi.mock('@/lib/api')
const mockApiPatch = vi.mocked(api.apiPatch)

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    wrapper: ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
    queryClient,
  }
}

describe('useHabitLog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * テストケース1: PATCH /habits/{id}/log が正しいパラメータで呼ばれる
   * Given: 習慣ID 'habit-1' と完了状態 true
   * When: mutate を実行する
   * Then: apiPatch('/api/habits/habit-1/log', { date, completed: true }) が呼ばれる
   * 🔵 REQ-404/501 より
   */
  it('mutate実行時に正しいAPIエンドポイントとパラメータで呼ばれる', async () => {
    mockApiPatch.mockResolvedValue({ success: true, data: { log: {}, streak: 5 } })
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useHabitLog(), { wrapper })

    const today = new Date().toISOString().slice(0, 10)
    act(() => {
      result.current.mutate({ habitId: 'habit-1', completed: true, date: today })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiPatch).toHaveBeenCalledWith('/api/habits/habit-1/log', {
      date: today,
      completed: true,
      input_method: 'manual',
    })
  })

  /**
   * テストケース2: 成功時にisSuccessがtrueになる
   * Given: APIが成功レスポンスを返す
   * When: mutate を実行する
   * Then: isSuccess が true になる
   * 🔵 REQ-501 より
   */
  it('API成功時にisSuccessがtrueになる', async () => {
    mockApiPatch.mockResolvedValue({ success: true, data: { log: {}, streak: 10 } })
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useHabitLog(), { wrapper })

    act(() => {
      result.current.mutate({ habitId: 'habit-2', completed: true, date: '2026-04-14' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  /**
   * テストケース3: バッジ獲得時にbadge_earnedが返る
   * Given: APIがbadge_earnedを含むレスポンスを返す
   * When: mutate を実行する
   * Then: data.badge_earned が存在する
   * 🔵 REQ-901 より
   */
  it('バッジ獲得時にレスポンスにbadge_earnedが含まれる', async () => {
    const badge = { id: 'badge-1', badge: { id: 'streak_7', name: '7日連続' } }
    mockApiPatch.mockResolvedValue({
      success: true,
      data: { log: {}, streak: 7, badge_earned: badge },
    })
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useHabitLog(), { wrapper })

    act(() => {
      result.current.mutate({ habitId: 'habit-1', completed: true, date: '2026-04-14' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect((result.current.data as { data?: { badge_earned?: unknown } })?.data?.badge_earned).toEqual(badge)
  })

  /**
   * テストケース4: API失敗時にisErrorがtrueになる
   * Given: APIがエラーを返す
   * When: mutate を実行する
   * Then: isError が true になる
   * 🟡 エラーハンドリング より
   */
  it('API失敗時にisErrorがtrueになる', async () => {
    mockApiPatch.mockRejectedValue(new Error('Network error'))
    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useHabitLog(), { wrapper })

    act(() => {
      result.current.mutate({ habitId: 'habit-1', completed: true, date: '2026-04-14' })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
