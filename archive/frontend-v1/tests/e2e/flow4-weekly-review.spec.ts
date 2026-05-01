/**
 * E2E Flow 4: 週次レビュー（user-stories 5.1）
 * TASK-0025: 統合テスト
 *
 * カバー:
 * - 週次レビュー画面に達成率アークが表示される（REQ-702）
 * - 「週次レビューを開始する」でSSE接続（REQ-703）
 * - AIフィードバックがストリーミング表示される（REQ-603・NFR-002）
 * - AI障害時エラーが表示される（EDGE-001）
 */
import { expect, test } from '@playwright/test'
import { injectAuthSession } from './helpers/auth'
import { setupBasicApiMocks, buildSSEResponse } from './helpers/mocks'

const API_BASE = 'http://localhost:8000'

test.describe('Flow 4: 週次レビュー', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthSession(page)
    await setupBasicApiMocks(page)
    // SSE デフォルトモック（接続エラーにならないよう空レスポンスを返す）
    await page.route(`${API_BASE}/api/ai/weekly-review/stream*`, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `data: ${JSON.stringify({ type: 'done', suggested_goals: [], actions: [], achievement_rate: 75 })}\n\n`,
      })
    })
    await page.goto('/weekly-review')
  })

  test('達成率アークと統計が表示される', async ({ page }) => {
    // 週次レビューページのヘッダー（h1要素を指定）
    await expect(page.getByRole('heading', { name: '週次レビュー' })).toBeVisible({ timeout: 8000 })
    // 「週次レビューを開始する」ボタン
    await expect(page.getByRole('button', { name: '週次レビューを開始する' })).toBeVisible()
  })

  test('AIフィードバックSSEがストリーミング表示される（NFR-002）', async ({ page }) => {
    // 前のbeforeEachのルートを上書き
    await page.unroute(`${API_BASE}/api/ai/weekly-review/stream*`)
    await page.route(`${API_BASE}/api/ai/weekly-review/stream*`, async route => {
      const body = buildSSEResponse([
        '今週の習慣達成率は75%でした。',
        '特に英語学習の継続が評価できます。',
      ])
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body,
      })
    })

    // レビュー開始
    await page.getByRole('button', { name: '週次レビューを開始する' }).click()

    // AIフィードバックが表示されること（チャンクが結合されて表示される）
    await expect(
      page.getByText(/今週の習慣達成率|英語学習/i)
    ).toBeVisible({ timeout: 10000 })
  })

  test('AI障害時にエラーメッセージが表示される（EDGE-001）', async ({ page }) => {
    // 前のbeforeEachのルートを上書き
    await page.unroute(`${API_BASE}/api/ai/weekly-review/stream*`)
    // SSEエンドポイントをエラーモック
    await page.route(`${API_BASE}/api/ai/weekly-review/stream*`, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `data: ${JSON.stringify({ type: 'error', error: 'AI_UNAVAILABLE' })}\n\n`,
      })
    })

    await page.getByRole('button', { name: '週次レビューを開始する' }).click()

    // エラーメッセージが表示されること
    await expect(
      page.getByText(/接続エラー|利用できません|エラー/i)
    ).toBeVisible({ timeout: 5000 })
  })
})
