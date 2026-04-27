/**
 * UI スナップショット & ビジュアル品質チェック
 * TASK-0025 拡張: Evaluator の UIビジュアル品質カテゴリ対応
 *
 * このスペックは以下を担う:
 * 1. 全主要画面のスクリーンショットを img/ フォルダに保存（ブログ用・Evaluator レビュー用）
 * 2. デザインシステム準拠チェック（ダークテーマ・フッターナビ・ガラスモーフィズム）
 * 3. モバイルビューポート（390×844px: iPhone 14 Pro相当）での表示確認
 *
 * スクリーンショット保存先: frontend/img/
 * 実行コマンド: npm run screenshots
 */
import { expect, test } from '@playwright/test'
import { injectAuthSession } from './helpers/auth'
import { setupBasicApiMocks, buildSSEResponse } from './helpers/mocks'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const API_BASE = 'http://localhost:8000'

// img/ ディレクトリを確保（frontend/img/）
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const IMG_DIR = path.resolve(__dirname, '../../img')
if (!fs.existsSync(IMG_DIR)) {
  fs.mkdirSync(IMG_DIR, { recursive: true })
}

/** img/ フォルダへのフルパスを返す */
function imgPath(filename: string) {
  return path.join(IMG_DIR, filename)
}

// ========================================
// デザインシステム準拠チェック ユーティリティ
// ========================================

/** AuthenticatedLayout の bg-[#020617] が適用されているか確認 */
async function checkDarkBackground(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => {
    const allEls = Array.from(document.querySelectorAll('*'))
    return allEls.some(el => {
      const bg = window.getComputedStyle(el).backgroundColor
      const rgb = bg.match(/\d+/g)?.map(Number)
      return rgb && rgb[0] <= 10 && rgb[1] <= 15 && rgb[2] <= 30 && bg !== 'rgba(0, 0, 0, 0)'
    })
  })
}

/** フッターナビが表示されているか確認 */
async function checkFooterNav(page: import('@playwright/test').Page): Promise<boolean> {
  return (await page.locator('nav').count()) > 0
}

/** ガラスモーフィズム（backdrop-filter: blur）が適用されているか確認 */
async function checkGlassMorphism(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('*')).some(el => {
      const style = window.getComputedStyle(el)
      return (style.backdropFilter || (style as CSSStyleDeclaration & { webkitBackdropFilter: string }).webkitBackdropFilter || '').includes('blur')
    })
  })
}

// ========================================
// 1. ログイン画面
// ========================================

test.describe('UIビジュアル品質: ログイン画面', () => {
  test('ログイン画面', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible({ timeout: 5000 })

    // ① ブログ用スクリーンショット
    await page.screenshot({ path: imgPath('01_login.png'), fullPage: true })

    // ② デザイン検証
    expect(await checkDarkBackground(page)).toBe(true)
    expect(await checkGlassMorphism(page)).toBe(true)
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /apple/i })).toBeVisible()
  })
})

// ========================================
// 2. ダッシュボード
// ========================================

test.describe('UIビジュアル品質: ダッシュボード', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthSession(page)
    await setupBasicApiMocks(page)
  })

  test('ダッシュボード（習慣一覧表示）', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('nav').last()).toBeVisible({ timeout: 5000 })

    await page.screenshot({ path: imgPath('02_dashboard.png'), fullPage: true })

    expect(await checkDarkBackground(page)).toBe(true)
    expect(await checkFooterNav(page)).toBe(true)
    expect(await checkGlassMorphism(page)).toBe(true)

    // フッターナビに 4 つ以上のリンク
    const linkCount = await page.locator('nav a, nav button').count()
    expect(linkCount).toBeGreaterThanOrEqual(4)
  })
})

// ========================================
// 3. Wanna Be 画面
// ========================================

test.describe('UIビジュアル品質: Wanna Be 画面', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthSession(page)
    await setupBasicApiMocks(page)
    await page.route(`${API_BASE}/api/wanna-be/analyze`, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: buildSSEResponse(
          ['6ヶ月後、あなたはビジネスの場で英語をリードできる存在になっています。そのために、まず毎朝の英語学習を習慣化することが最短ルートです。'],
          [
            { title: 'ビジネス英会話の実用化', description: '6ヶ月以内に、営業場面での英会話をリード可能なレベルに到達' },
            { title: '毎朝30分の英語インプット', description: '継続的なリスニング・単語学習で基礎力を底上げする' },
          ]
        ),
      })
    })
  })

  test('Wanna Be 入力画面', async ({ page }) => {
    await page.goto('/wanna-be')
    await expect(page.getByRole('textbox')).toBeVisible({ timeout: 5000 })

    await page.screenshot({ path: imgPath('03_wanna_be.png'), fullPage: true })

    expect(await checkDarkBackground(page)).toBe(true)
    expect(await checkFooterNav(page)).toBe(true)
  })

  test('AI 分析中の画面', async ({ page }) => {
    await page.goto('/wanna-be')
    await expect(page.getByRole('button', { name: /AIに相談/i })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /AIに相談/i }).click()

    // ストリーミング中（テキストが流れ始めた直後）
    await expect(page.getByText(/6ヶ月後/)).toBeVisible({ timeout: 3000 })
    await page.screenshot({ path: imgPath('04_wanna_be_streaming.png'), fullPage: true })
  })

  test('AI 分析完了・目標候補表示', async ({ page }) => {
    await page.goto('/wanna-be')
    await expect(page.getByRole('button', { name: /AIに相談/i })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /AIに相談/i }).click()

    // 目標候補が表示された状態
    await expect(page.getByText('ビジネス英会話の実用化')).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: imgPath('05_wanna_be_goals.png'), fullPage: true })
  })
})

// ========================================
// 4. 週次レビュー画面
// ========================================

test.describe('UIビジュアル品質: 週次レビュー画面', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthSession(page)
    await setupBasicApiMocks(page)
    await page.route(`${API_BASE}/api/weekly-reviews/generate`, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: buildSSEResponse(['今週は7つの習慣のうち5つを達成しました。達成率71%は先週より10ポイント向上しています。']),
      })
    })
  })

  test('週次レビュー（開始前）', async ({ page }) => {
    await page.goto('/weekly-review')
    await expect(page.getByRole('heading', { name: /週次レビュー/i })).toBeVisible({ timeout: 5000 })

    await page.screenshot({ path: imgPath('06_weekly_review.png'), fullPage: true })

    expect(await checkDarkBackground(page)).toBe(true)
    expect(await checkFooterNav(page)).toBe(true)
  })
})

// ========================================
// 5. 設定画面
// ========================================

test.describe('UIビジュアル品質: 設定画面', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthSession(page)
    await setupBasicApiMocks(page)
  })

  test('設定画面', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('input, select, button').first()).toBeVisible({ timeout: 5000 })

    await page.screenshot({ path: imgPath('07_settings.png'), fullPage: true })

    expect(await checkDarkBackground(page)).toBe(true)
    expect(await checkFooterNav(page)).toBe(true)
  })
})

// ========================================
// 8. オンボーディング画面
// ========================================

test.describe('UIビジュアル品質: オンボーディング画面', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthSession(page)
  })

  test('オンボーディング画面（ダークテーマ確認）', async ({ page }) => {
    await page.goto('/onboarding')
    await expect(page.getByRole('button', { name: /なりたい自分/ })).toBeVisible({ timeout: 5000 })

    await page.screenshot({ path: imgPath('08_onboarding.png'), fullPage: true })

    // ダークテーマで統一されていること
    expect(await checkDarkBackground(page)).toBe(true)

    // CTAボタンが見えること
    await expect(page.getByRole('button', { name: /なりたい自分/ })).toBeVisible()

    // ステップ説明が3件表示されること
    const steps = page.locator('li')
    await expect(steps).toHaveCount(3)
  })
})
