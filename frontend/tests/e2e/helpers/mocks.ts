/**
 * E2E テスト用 API モックヘルパー
 * page.route() でバックエンド API をインターセプトして固定データを返す
 */
import type { Page } from '@playwright/test'

const API_BASE = 'http://localhost:8000'

// テスト用習慣データ
export const MOCK_HABITS = [
  {
    id: 'habit-001',
    user_id: 'test-user-id',
    title: '朝の英語学習',
    description: '毎朝30分、英語を勉強する',
    scheduled_time: '07:00',
    is_active: true,
    current_streak: 5,
    today_completed: false,
    today_log: null,
  },
  {
    id: 'habit-002',
    user_id: 'test-user-id',
    title: '筋トレ',
    description: '週3回、30分間の筋トレ',
    scheduled_time: '18:00',
    is_active: true,
    current_streak: 3,
    today_completed: false,
    today_log: null,
  },
]

export const MOCK_HABITS_ALL_DONE = MOCK_HABITS.map(h => ({
  ...h,
  today_completed: true,
  today_log: { id: `log-${h.id}`, habit_id: h.id, completed: true, date: '2026-04-15' },
  current_streak: h.current_streak + 1,
}))

export const MOCK_STATS = {
  achievement_rate: 0,
  completed_count: 0,
  total_habits: 2,
  current_streak: 5,
}

export const MOCK_GOALS = [
  {
    id: 'goal-001',
    user_id: 'test-user-id',
    title: 'ビジネス英会話の実用化',
    description: '6ヶ月以内に、営業場面での英会話をリード可能なレベルに到達',
    is_active: true,
    display_order: 0,
  },
]

export const MOCK_WANNA_BE = {
  id: 'wanna-be-001',
  user_id: 'test-user-id',
  text: '英語を流暢に話せる営業担当者になりたい',
}

export const MOCK_PROFILE = {
  id: 'test-user-id',
  display_name: 'テストユーザー',
  email: 'test@example.com',
  notification_email: 'test@example.com',
  weekly_review_day: 0,
}

/** 習慣一覧・基本データをまとめてモック */
export async function setupBasicApiMocks(page: Page) {
  // 習慣一覧
  await page.route(`${API_BASE}/api/habits*`, async route => {
    const url = route.request().url()
    if (url.includes('include_today_log')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: MOCK_HABITS }),
      })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: MOCK_HABITS }),
      })
    }
  })

  // 週次統計
  await page.route(`${API_BASE}/api/stats/weekly`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: MOCK_STATS }),
    })
  })

  // バッジ
  await page.route(`${API_BASE}/api/badges*`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] }),
    })
  })

  // 長期目標
  await page.route(`${API_BASE}/api/goals`, async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: MOCK_GOALS }),
      })
    } else {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: MOCK_GOALS }),
      })
    }
  })

  // Wanna Be
  await page.route(`${API_BASE}/api/wanna-be`, async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: MOCK_WANNA_BE }),
      })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: MOCK_WANNA_BE }),
      })
    }
  })

  // ユーザープロフィール
  await page.route(`${API_BASE}/api/users/me*`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: MOCK_PROFILE }),
    })
  })

  // 週次レビュー履歴
  await page.route(`${API_BASE}/api/weekly-reviews*`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] }),
    })
  })

  // 通知設定
  await page.route(`${API_BASE}/api/notifications/settings`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: {} }),
    })
  })
}

/** 習慣チェック API をモック（checkin / uncheck） */
export async function setupHabitCheckMocks(
  page: Page,
  opts: { shouldEarnBadge?: boolean } = {}
) {
  await page.route(`${API_BASE}/api/habits/*/logs`, async route => {
    const response: Record<string, unknown> = {
      success: true,
      data: {
        id: 'log-new',
        habit_id: 'habit-001',
        completed: true,
        date: '2026-04-15',
        new_streak: 6,
        earned_badges: opts.shouldEarnBadge
          ? [{ id: 'badge-001', name: '7日連続', description: '7日連続達成' }]
          : [],
      },
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    })
  })
}

/** SSE形式のAIフィードバックをモック */
export function buildSSEResponse(
  chunks: string[],
  suggestedGoals: { title: string; description: string }[] = [],
  achievementRate = 75
): string {
  const lines: string[] = []
  for (const chunk of chunks) {
    lines.push(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`)
  }
  lines.push(
    `data: ${JSON.stringify({ type: 'done', suggested_goals: suggestedGoals, achievement_rate: achievementRate })}\n\n`
  )
  return lines.join('')
}
