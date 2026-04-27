/**
 * Dashboard.tsx テスト
 * TASK-0014: ダッシュボード画面実装
 *
 * テストケース:
 * 1. 習慣リストの表示（3件）
 * 2. Wanna Be接続文とストリーク表示
 * 3. 週間達成率の表示
 * 4. ローディング状態のスケルトン表示
 * 5. エラー時の再試行ボタン表示
 *
 * 🔵 信頼性レベル: REQ-205/306/502/504/505 より
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import axios from 'axios'
import * as api from '@/lib/api'

vi.mock('@/lib/api')
vi.mock('@/store/authStore', () => ({
  useAuthStore: () => ({
    signOut: vi.fn(),
    user: { email: 'test@example.com' },
    isAuthenticated: true,
  }),
}))

vi.mock('@/hooks/useHabitLog', () => ({
  useHabitLog: () => ({
    mutate: vi.fn(),
    isPending: false,
    data: null,
  }),
}))

// TanStack Queryをモック
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: vi.fn(),
  }
})

import { useQuery } from '@tanstack/react-query'
import Dashboard from '@/pages/Dashboard'

const mockUseQuery = vi.mocked(useQuery)
const mockApiGet = vi.mocked(api.apiGet)

/** モック習慣データ（3件） */
const mockHabits = [
  {
    id: 'habit-1',
    title: 'ランニング30分',
    current_streak: 14,
    scheduled_time: '07:00',
    wanna_be_connection_text: '→ 過去一の身体に +1',
    today_completed: false,
    today_log: { completed: false, log_date: '2026-04-14' },
    is_active: true,
  },
  {
    id: 'habit-2',
    title: '英語学習30分',
    current_streak: 5,
    scheduled_time: '08:00',
    wanna_be_connection_text: '→ グローバルエンジニアに +1',
    today_completed: true,
    today_log: { completed: true, log_date: '2026-04-14' },
    is_active: true,
  },
  {
    id: 'habit-3',
    title: '読書20分',
    current_streak: 0,
    scheduled_time: null,
    wanna_be_connection_text: null,
    today_completed: false,
    today_log: null,
    is_active: true,
  },
]

/** モック週間統計 */
const mockWeeklyStats = {
  week_start: '2026-04-08',
  total_habits: 3,
  completed_count: 15,
  achievement_rate: 71,
  habit_stats: [
    { habit_id: 'habit-1', habit_title: 'ランニング30分', achievement_rate: 86, current_streak: 14 },
    { habit_id: 'habit-2', habit_title: '英語学習30分', achievement_rate: 71, current_streak: 5 },
    { habit_id: 'habit-3', habit_title: '読書20分', achievement_rate: 57, current_streak: 0 },
  ],
}

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  )

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ success: true, data: mockHabits })
  })

  /**
   * テストケース1: 習慣リストの表示（3件）
   * Given: 3件の習慣データを返すAPIモック
   * When: Dashboard コンポーネントをレンダリングする
   * Then: 3件の習慣タイトルが表示される
   * 🔵 REQ-306 より
   */
  it('3件の習慣タイトルが表示される', async () => {
    mockUseQuery.mockReturnValue({
      data: { habits: mockHabits, weeklyStats: mockWeeklyStats },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)

    renderDashboard()

    await waitFor(() => {
      expect(screen.getAllByText('ランニング30分').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('英語学習30分').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('読書20分').length).toBeGreaterThanOrEqual(1)
    })
  })

  /**
   * テストケース2: Wanna Be接続文とストリーク表示
   * Given: Wanna Be接続文とストリーク数を含む習慣データ
   * When: Dashboard コンポーネントをレンダリングする
   * Then: 接続文「→ 過去一の身体に +1」とストリーク「🔥14日連続」が表示される
   * 🔵 REQ-205/502 より
   */
  it('Wanna Be接続文とストリーク日数が表示される', async () => {
    mockUseQuery.mockReturnValue({
      data: { habits: mockHabits, weeklyStats: mockWeeklyStats },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)

    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('→ 過去一の身体に +1')).toBeInTheDocument()
      expect(screen.getByText(/14日連続/)).toBeInTheDocument()
    })
  })

  /**
   * テストケース3: 週間達成率の表示
   * Given: 週間統計データ（達成率71%）
   * When: Dashboard コンポーネントをレンダリングする
   * Then: 「71%」が表示される
   * 🔵 REQ-504 より
   */
  it('週間達成率が表示される', async () => {
    mockUseQuery.mockReturnValue({
      data: { habits: mockHabits, weeklyStats: mockWeeklyStats },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)

    renderDashboard()

    await waitFor(() => {
      expect(screen.getAllByText(/71%/).length).toBeGreaterThanOrEqual(1)
    })
  })

  /**
   * テストケース4: ローディング状態のスケルトン表示
   * Given: データ取得中（isPending=true）
   * When: Dashboard コンポーネントをレンダリングする
   * Then: スケルトンローダーが表示され、習慣リストが表示されない
   * 🟡 UX向上のための推測による実装
   */
  it('isPendingのとき、スケルトンローダーが表示される', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never)

    renderDashboard()

    expect(document.querySelector('.animate-pulse')).toBeInTheDocument()
    expect(screen.queryByText('ランニング30分')).not.toBeInTheDocument()
  })

  /**
   * テストケース5: エラー時の再試行ボタン表示
   * Given: APIエラー（isError=true）
   * When: Dashboard コンポーネントをレンダリングする
   * Then: 「データを読み込めませんでした」と「再試行する」ボタンが表示される
   * 🔵 EDGE-001 より
   */
  it('isErrorのとき、エラーメッセージと再試行ボタンが表示される', () => {
    const mockRefetch = vi.fn()
    const error = new axios.AxiosError('Request failed with status code 500')
    error.config = { url: '/api/habits?include_today_log=true' } as never
    error.response = {
      status: 500,
      data: { detail: 'Internal Server Error' },
      statusText: 'Internal Server Error',
      headers: {},
      config: {} as never,
    }

    mockUseQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error,
      refetch: mockRefetch,
    } as never)

    renderDashboard()

    expect(screen.getByText('データを読み込めませんでした')).toBeInTheDocument()
    expect(screen.getByText('/api/habits?include_today_log=true')).toBeInTheDocument()
    expect(screen.getByText('500')).toBeInTheDocument()
    expect(screen.getByText('Request failed with status code 500')).toBeInTheDocument()
    expect(screen.getByText(/Internal Server Error/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '再試行する' })).toBeInTheDocument()
  })

  /**
   * テストケース6: 再試行ボタンのクリック
   * Given: エラー状態のダッシュボード
   * When: 「再試行する」ボタンをクリックする
   * Then: refetch が呼ばれる
   * 🔵 EDGE-001 より
   */
  it('再試行ボタンクリックで refetch が呼ばれる', () => {
    const mockRefetch = vi.fn()
    mockUseQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('Network error'),
      refetch: mockRefetch,
    } as never)

    renderDashboard()

    fireEvent.click(screen.getByRole('button', { name: '再試行する' }))
    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })
})
