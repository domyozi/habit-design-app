/**
 * E2E Flow 3: Wanna Be 設定・AI 分析フロー（REQ-201/202/203）
 * TASK-0025 拡張: UI/UX 評価対応
 *
 * カバー:
 * - Wanna Be 入力テキストエリアが表示されること（REQ-201）
 * - 既存 Wanna Be テキストがプリロードされること（REQ-202）
 * - 「AIに相談する」でストリーミング分析が始まること（REQ-203 / NFR-002）
 * - 目標候補が表示されること
 * - 目標保存後にダッシュボードへ遷移すること
 * - AI 障害時にエラーメッセージが表示されること（EDGE-001）
 */
import { expect, test } from '@playwright/test'
import { injectAuthSession } from './helpers/auth'
import { setupBasicApiMocks, buildSSEResponse, MOCK_WANNA_BE } from './helpers/mocks'

const API_BASE = 'http://localhost:8000'

test.describe('Flow 3: Wanna Be 設定・AI 分析', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthSession(page)
    await setupBasicApiMocks(page)

    // AI 分析 SSE エンドポイントをモック
    await page.route(`${API_BASE}/api/wanna-be/analyze`, async route => {
      const body = buildSSEResponse(
        ['あなたの目標を分析しました。', '以下の習慣が効果的です。'],
        [
          { title: 'ビジネス英会話の実用化', description: '6ヶ月で営業場面をリード可能なレベルへ' },
          { title: '毎朝30分の英語学習', description: '継続的なインプット習慣を確立する' },
        ]
      )
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body,
      })
    })

    // 目標保存エンドポイントをモック
    await page.route(`${API_BASE}/api/goals`, async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { id: 'goal-saved-001' } }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: [] }),
        })
      }
    })

    await page.goto('/wanna-be')
  })

  test('Wanna Be 入力テキストエリアが表示される（REQ-201）', async ({ page }) => {
    await expect(page.getByRole('textbox')).toBeVisible({ timeout: 5000 })
  })

  test('既存の Wanna Be テキストがプリロードされる（REQ-202）', async ({ page }) => {
    const textarea = page.getByRole('textbox')
    await expect(textarea).toBeVisible({ timeout: 5000 })
    await expect(textarea).toHaveValue(MOCK_WANNA_BE.text)
  })

  test('「AIに相談する」ボタンが表示される', async ({ page }) => {
    await expect(page.getByRole('textbox')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /AIに相談/i })).toBeVisible()
  })

  test('AIに相談するとストリーミングテキストが表示される（REQ-203 / NFR-002）', async ({ page }) => {
    await expect(page.getByRole('textbox')).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /AIに相談/i }).click()
    // ストリーミングテキストが2秒以内に現れること（NFR-002）
    await expect(page.getByText('あなたの目標を分析しました。')).toBeVisible({ timeout: 2000 })
  })

  test('AI分析完了後に目標候補が表示される', async ({ page }) => {
    await expect(page.getByRole('textbox')).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /AIに相談/i }).click()
    // 分析完了（done イベント）後に目標候補が表示されること
    await expect(page.getByText('ビジネス英会話の実用化')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('毎朝30分の英語学習')).toBeVisible()
  })

  test('ダークテーマとフッターナビが表示されている', async ({ page }) => {
    await expect(page.getByRole('textbox')).toBeVisible({ timeout: 5000 })
    // フッターナビの存在確認
    await expect(page.locator('nav').last()).toBeVisible()
    // ダーク系背景の確認
    const bgColor = await page.evaluate(() => {
      const el = document.querySelector('[class*="bg-\\[#020617\\]"]') ||
                 document.querySelector('[style*="background"]') ||
                 document.body
      return window.getComputedStyle(el).backgroundColor
    })
    const rgb = bgColor.match(/\d+/g)?.map(Number) ?? [255, 255, 255]
    // ダーク系（R, G, B いずれかが 50 未満）
    expect(Math.min(...rgb)).toBeLessThan(50)
  })

  test('AI 障害時にエラーメッセージが表示される（EDGE-001）', async ({ page }) => {
    // SSE エンドポイントをエラーレスポンスで上書き
    await page.unroute(`${API_BASE}/api/wanna-be/analyze`)
    await page.route(`${API_BASE}/api/wanna-be/analyze`, async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'AI service unavailable' }),
      })
    })

    await expect(page.getByRole('textbox')).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /AIに相談/i }).click()
    // エラーメッセージが表示されること
    await expect(
      page.getByText(/エラー|失敗|利用できません|しばらく/i)
    ).toBeVisible({ timeout: 5000 })
  })
})
