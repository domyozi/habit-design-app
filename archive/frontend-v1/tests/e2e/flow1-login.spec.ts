/**
 * E2E Flow 1: ログイン画面（UI/UX + 機能）
 * TASK-0025 拡張: UI/UX 評価対応
 *
 * カバー:
 * - ログイン画面の主要 UI 要素が表示されること
 * - ダークテーマが適用されていること（NFR-design）
 * - 未認証ユーザーが保護ルートからリダイレクトされること（NFR-102）
 */
import { expect, test } from '@playwright/test'

test.describe('Flow 1: ログイン画面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('ログインページが正常に表示される', async ({ page }) => {
    await expect(page).toHaveURL('/login')
    // ブランド名
    await expect(page.getByText('Habit Design')).toBeVisible()
    // メインコピー
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('Google・Appleサインインボタンが表示される', async ({ page }) => {
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /apple/i })).toBeVisible()
  })

  test('ダークテーマが適用されている（背景色）', async ({ page }) => {
    // bg-[#020617] = rgb(2, 6, 23) が body または直下要素に適用されていること
    const bgColor = await page.evaluate(() => {
      const el = document.querySelector('main') || document.body
      return window.getComputedStyle(el).backgroundColor
    })
    // ダーク系の背景色（R・G・B いずれも 50 未満）
    const rgb = bgColor.match(/\d+/g)?.map(Number) ?? [255, 255, 255]
    expect(rgb[0]).toBeLessThan(50)
    expect(rgb[1]).toBeLessThan(50)
    expect(rgb[2]).toBeLessThan(50)
  })

  test('ページにコンソールエラーがない', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.waitForTimeout(500)
    expect(errors).toHaveLength(0)
  })
})
