import { test, expect } from '@playwright/test'
import { loginAsTestUser } from './helpers/auth'

// ============================================================
// テストスイート1: KGI 設定フロー
// ============================================================
test.describe('KGI 設定フロー', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page)
    await page.click('[data-testid="monthly-tab"]')
  })

  test('既存のGoalをKGIとして設定し、KGIカードが表示される', async ({ page }) => {
    // 既存 Goal の「KGI化」ボタンをクリック
    const goalCard = page.locator('[data-testid^="goal-card-"]').first()
    await goalCard.locator('[data-testid="set-kgi-button"]').click()

    // KGI 設定フォームに入力
    await page.selectOption('[data-testid="kgi-metric-type-select"]', 'numeric')
    await page.fill('[data-testid="kgi-target-value-input"]', '70')
    await page.fill('[data-testid="kgi-unit-input"]', 'kg')

    // target_date: 今日から6ヶ月後
    const sixMonthsLater = new Date()
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6)
    const targetDate = sixMonthsLater.toISOString().split('T')[0]
    await page.fill('[data-testid="kgi-target-date-input"]', targetDate)

    // 保存
    await page.click('[data-testid="kgi-save-button"]')

    // KGI カードが表示されることを確認
    await expect(page.locator('[data-testid^="kgi-card-"]')).toBeVisible({ timeout: 5000 })

    // プログレスバー・残り日数・目標値が表示されることを確認
    await expect(page.locator('[data-testid^="kgi-progress-bar-"]')).toBeVisible()
    await expect(page.locator('[data-testid^="kgi-days-remaining-"]')).toBeVisible()
    await expect(page.locator('[data-testid^="kgi-target-value-"]')).toContainText('70')
  })
})

// ============================================================
// テストスイート2: KPI 作成・習慣連結フロー
// ============================================================
test.describe('KPI 作成・習慣連結フロー', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page)
    await page.click('[data-testid="monthly-tab"]')
    // KGI が設定済みの Goal を前提とする
  })

  test('KGIにKPIを追加し、習慣を連結できる', async ({ page }) => {
    // KGI カードから「KPIを追加」クリック
    const kgiCard = page.locator('[data-testid^="kgi-card-"]').first()
    await kgiCard.locator('[data-testid="add-kpi-button"]').click()

    // KPI フォームに入力
    await page.fill('[data-testid="kpi-title-input"]', '週の運動日数')
    await page.selectOption('[data-testid="kpi-metric-type-select"]', 'numeric')
    await page.fill('[data-testid="kpi-target-value-input"]', '4')
    await page.fill('[data-testid="kpi-unit-input"]', '回/週')
    await page.selectOption('[data-testid="kpi-tracking-frequency-select"]', 'weekly')

    // KPI 保存
    await page.click('[data-testid="kpi-form-save-button"]')

    // KPI が KGI 配下に表示されることを確認
    await expect(kgiCard.locator('[data-testid^="kpi-item-"]')).toContainText('週の運動日数')

    // 「関連習慣を選択」クリック
    await kgiCard
      .locator('[data-testid^="kpi-item-"]')
      .first()
      .locator('[data-testid="link-habits-button"]')
      .click()

    // 習慣を1件チェック
    const habitCheckbox = page.locator('[data-testid^="habit-option-"]').first()
    await habitCheckbox.click()

    // 保存
    await page.click('[data-testid="link-habits-save-button"]')

    // KPI に習慣名が表示されることを確認
    await expect(
      kgiCard
        .locator('[data-testid^="kpi-item-"]')
        .first()
        .locator('[data-testid^="kpi-habit-link-"]'),
    ).toBeVisible()
  })
})

// ============================================================
// テストスイート3: KPI ログ記録フロー
// ============================================================
test.describe('KPI ログ記録フロー', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page)
    await page.click('[data-testid="daily-tab"]')
  })

  test('numeric KPI に数値を入力して「記録済み」になる', async ({ page }) => {
    const kpiSection = page.locator('[data-testid="kpi-section"]')
    await expect(kpiSection).toBeVisible({ timeout: 5000 })

    // numeric KPI の入力フィールドに値を入力
    const numericInput = kpiSection.locator('[data-testid^="kpi-numeric-input-"]').first()
    await numericInput.fill('4')

    // 「記録」ボタンをクリック
    const submitButton = kpiSection.locator('[data-testid^="kpi-submit-button-"]').first()
    await submitButton.click()

    // 「記録済み」表示に切り替わることを確認
    await expect(
      kpiSection.locator('[data-testid^="kpi-log-completed-"]').first(),
    ).toBeVisible({ timeout: 3000 })
  })

  test('binary KPI のチェックボックスをクリックすると即時「記録済み」になる', async ({ page }) => {
    const kpiSection = page.locator('[data-testid="kpi-section"]')
    await expect(kpiSection).toBeVisible({ timeout: 5000 })

    const binaryCheckbox = kpiSection.locator('[data-testid^="kpi-binary-checkbox-"]').first()
    await binaryCheckbox.click()

    // 即時に完了表示になることを確認（楽観的更新）
    await expect(
      kpiSection.locator('[data-testid^="kpi-log-completed-"]').first(),
    ).toBeVisible({ timeout: 3000 })
  })

  test('percentage KPI に 101 を入力するとエラーメッセージが表示される', async ({ page }) => {
    const kpiSection = page.locator('[data-testid="kpi-section"]')
    await expect(kpiSection).toBeVisible({ timeout: 5000 })

    const percentageInput = kpiSection.locator('[data-testid^="kpi-percentage-input-"]').first()
    await percentageInput.fill('101')

    // エラーメッセージが表示されることを確認
    await expect(
      kpiSection.locator('[data-testid^="kpi-percentage-error-"]').first(),
    ).toContainText('0〜100の値を入力してください')

    // 「記録」ボタンが disabled であることを確認
    await expect(
      kpiSection.locator('[data-testid^="kpi-submit-button-"]').first(),
    ).toBeDisabled()
  })
})

// ============================================================
// テストスイート4: KGI 現在値更新フロー
// ============================================================
test.describe('KGI 現在値更新フロー', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page)
    await page.click('[data-testid="monthly-tab"]')
  })

  test('KGI の現在値を更新するとカードとプログレスバーが更新される', async ({ page }) => {
    // 「現在値を更新」ボタンをクリック
    const kgiCard = page.locator('[data-testid^="kgi-card-"]').first()
    await kgiCard.locator('[data-testid="update-current-value-button"]').click()

    // モーダルが表示されることを確認
    const modal = page.locator('[data-testid="update-kgi-modal"]')
    await expect(modal).toBeVisible()

    // 新しい現在値を入力
    await modal.locator('[data-testid="kgi-current-value-input"]').fill('74.5')
    await modal.locator('[data-testid="kgi-current-value-save-button"]').click()

    // モーダルが閉じることを確認
    await expect(modal).not.toBeVisible({ timeout: 3000 })

    // KGI カードの現在値が更新されることを確認
    await expect(kgiCard.locator('[data-testid^="kgi-current-value-"]')).toContainText('74.5')

    // プログレスバーが表示されていることを確認
    await expect(kgiCard.locator('[data-testid^="kgi-progress-bar-"]')).toBeVisible()
  })
})

// ============================================================
// テストスイート5: KPI グラフ表示フロー
// ============================================================
test.describe('KPI グラフ表示フロー', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page)
    await page.click('[data-testid="monthly-tab"]')
  })

  test('KPIカードを展開するとグラフが表示され、タブ切り替えができる', async ({ page }) => {
    // KGI カード内の KPI アイテムをクリック（展開）
    const kpiItem = page.locator('[data-testid^="kpi-item-"]').first()
    await kpiItem.click()

    // KpiChart が表示されることを確認
    const kpiChart = page.locator('[data-testid="kpi-chart"]')
    await expect(kpiChart).toBeVisible({ timeout: 5000 })

    // 「週次」タブをクリック
    await kpiChart.locator('[data-testid="kpi-chart-tab-weekly"]').click()

    // ローディングが終わるのを待つ
    await expect(kpiChart.locator('[data-testid="kpi-chart-loading"]')).not.toBeVisible({
      timeout: 5000,
    })

    // グラフまたは「記録がありません」メッセージが表示されることを確認
    const graphOrEmpty = kpiChart.locator(
      '[data-testid="kpi-chart-graph"], [data-testid="kpi-chart-empty"]',
    )
    await expect(graphOrEmpty).toBeVisible()

    // 「月次」タブをクリック
    await kpiChart.locator('[data-testid="kpi-chart-tab-monthly"]').click()
    await expect(kpiChart.locator('[data-testid="kpi-chart-loading"]')).not.toBeVisible({
      timeout: 5000,
    })
    await expect(graphOrEmpty).toBeVisible()
  })
})

// ============================================================
// テストスイート6: エラーハンドリング
// ============================================================
test.describe('エラーハンドリング', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page)
    await page.click('[data-testid="monthly-tab"]')
  })

  test('KGI設定フォームで target_date 未入力のまま送信するとエラーが表示される', async ({
    page,
  }) => {
    const goalCard = page.locator('[data-testid^="goal-card-"]').first()
    await goalCard.locator('[data-testid="set-kgi-button"]').click()

    // target_date を入力せずに target_value のみ入力して保存
    await page.fill('[data-testid="kgi-target-value-input"]', '70')
    await page.click('[data-testid="kgi-save-button"]')

    // バリデーションエラーが表示されることを確認
    await expect(page.locator('[data-testid="kgi-target-date-error"]')).toBeVisible()
  })

  test('APIネットワークエラー時にエラー状態が表示される', async ({ page, context }) => {
    // ネットワークエラーをシミュレート
    await context.route('**/api/**', (route) => route.abort('failed'))

    // 今日の画面に移動
    await page.click('[data-testid="daily-tab"]')

    // エラー状態またはエラートーストが表示されることを確認
    await expect(
      page.locator('[data-testid="kpi-section-error"], [data-testid="error-toast"]'),
    ).toBeVisible({ timeout: 5000 })

    // ルートを解除して他テストに影響しないようにする
    await context.unroute('**/api/**')
  })
})
