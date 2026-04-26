import { expect, test } from '@playwright/test'

const morningMustTasks = [
  '早起き（5時台起床）',
  '筋トレ',
  '英語学習',
  '副業推進',
  '有酸素運動',
]

const morningRoutineTasks = [
  '白湯を飲む',
  '前日の振り返り（やったこと・学び・Next）',
  '体重測定',
  'カレンダーを埋める',
  'シャワー',
  '瞑想',
  '心得を暗唱する',
  '舌を回す',
]

const eveningReflectionTasks = [
  '体重測定（夜）',
  'ダッシュボードのGap確認',
  '目標実績を更新する',
  '気づきを更新する',
  '心得・意識すべきことを見る',
  '翌日の予定をスケジューリング（★余裕30m）',
]

const eveningPrepTasks = [
  '水とコップをデスクにセット',
  'アラームをセットして机の上に置く',
  'アウターを部屋に持ってくる',
]

const morningTaskIds: Record<string, string> = {
  '早起き（5時台起床）': 'early-rise',
  '筋トレ': 'training',
  '英語学習': 'english',
  '副業推進': 'side-proj',
  '有酸素運動': 'cardio',
}

const morningRoutineTaskIds: Record<string, string> = {
  '白湯を飲む': 'water',
  '前日の振り返り（やったこと・学び・Next）': 'review',
  '体重測定': 'weight',
  'カレンダーを埋める': 'calendar',
  'シャワー': 'shower',
  '瞑想': 'meditation',
  '心得を暗唱する': 'motto',
  '舌を回す': 'tongue',
}

const eveningTaskIds: Record<string, string> = {
  '体重測定（夜）': 'weight-eve',
  'ダッシュボードのGap確認': 'gap',
  '目標実績を更新する': 'update-goal',
  '気づきを更新する': 'insight',
  '心得・意識すべきことを見る': 'motto-eve',
  '翌日の予定をスケジューリング（★余裕30m）': 'schedule',
  '水とコップをデスクにセット': 'water-prep',
  'アラームをセットして机の上に置く': 'alarm',
  'アウターを部屋に持ってくる': 'outer',
}

const morningGoal = '今日は英語学習を最優先にして、朝のルーティンを終えます'

const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.describe('UAT: one-day execution flow', () => {
  test('morning check-in -> primary target -> routines -> report -> evening review', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 })
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()

    const today = todayKey()
    const snapshotBefore = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
    expect(snapshotBefore['daily-os:boss']).toBe('null')

    const morningCheckin = page.getByPlaceholder('例: 昨日は英語が進まず、今月のギャップを感じています。今日は英語を最優先にして、理想の自分に近づきたい...')
    await morningCheckin.fill([
      '昨日は英語学習が進まず、今月のギャップを感じています。',
      morningGoal,
      '今日のプライマリーターゲットは資料作成を完了することです。',
      '理想像は、朝の意思決定が早くて、毎日淡々と実行できる人です。',
      '筋トレ',
      '資料レビュー',
    ].join('\n'))

    await page.getByRole('button', { name: 'Generate check-in' }).click()
    await expect(page.getByText('Apply goal')).toBeVisible()
    await page.getByRole('button', { name: 'Apply gap' }).click()
    await page.getByRole('button', { name: 'Apply goal' }).click()
    await page.getByRole('button', { name: 'Apply tasks' }).click()

    await expect(page.getByRole('button', { name: 'Apply tasks' })).toBeVisible()
    await expect(page.getByText('Morning diff')).toBeVisible()
    await expect(page.getByText('confirmed changes')).toBeVisible()
    await expect.poll(async () => page.evaluate(() => localStorage.getItem('daily-os:boss'))).toContain(morningGoal)

    await page.locator('nav').last().getByRole('button', { name: /朝/ }).click()
    await expect(page.getByText(morningGoal).last()).toBeVisible()

    for (const label of morningMustTasks) {
      await page.locator(`[data-testid="morning-check-${morningTaskIds[label]}"]`).click()
    }
    await page.getByRole('button', { name: /Routine tasks/ }).click()
    for (const label of morningRoutineTasks) {
      await page.locator(`[data-testid="morning-check-${morningRoutineTaskIds[label]}"]`).click()
    }

    await page.getByRole('button', { name: /State/ }).click()
    await page.locator('input[type="number"]').first().fill('72.4')
    await page.getByRole('button', { name: 'Generate report' }).click()

    await expect(page.getByText('Monthly analysis')).toBeVisible()
    await page.getByRole('button', { name: 'Week' }).click()
    await expect(page.getByText('This week')).toBeVisible()
    await page.getByRole('button', { name: 'Month' }).click()
    await expect(page.getByText('This month overview')).toBeVisible()
    await page.getByRole('button', { name: 'Year' }).click()
    await expect(page.getByText('Annual habit curves')).toBeVisible()

    await page.locator('nav').last().getByRole('button', { name: /夜/ }).click()
    await expect(page.getByText('Primary target for tomorrow')).toBeVisible()

    await page.getByPlaceholder('明日の最重要タスクを今設定...').fill('明日の資料レビューを完了する')
    await page.getByRole('button', { name: 'Apply' }).click()

    await page.getByPlaceholder('今日できなかったこと、改善点...').fill('午前の集中が足りなかった')
    await page.getByPlaceholder('今日気づいたこと、学んだこと...').fill('朝に先に意思決定を固めると流れがいい')
    await page.getByPlaceholder('明日のタスク・予定...').fill('午前に資料レビュー、午後に修正')

    for (const label of eveningReflectionTasks) {
      await page.locator(`[data-testid="evening-check-${eveningTaskIds[label]}"]`).click()
    }
    for (const label of eveningPrepTasks) {
      await page.locator(`[data-testid="evening-check-${eveningTaskIds[label]}"]`).click()
    }

    await page.getByRole('button', { name: 'Generate report' }).click()
    await page.getByRole('button', { name: 'Complete review' }).click()

    await expect(page.getByText('Evening review complete')).toBeVisible()

    const snapshotAfter = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
    expect(snapshotAfter['daily-os:boss']).toContain('明日の資料レビューを完了する')
    expect(snapshotAfter[`daily:${today}:morning:checked`]).not.toBe('[]')
    expect(snapshotAfter[`daily:${today}:evening:checked`]).not.toBe('[]')
    expect(snapshotAfter[`daily:${today}:morning:report`]).toContain('Morning report')
    expect(snapshotAfter[`daily:${today}:evening:report`]).toContain('Evening report')
    expect(snapshotAfter[`morning:checkin:transcript:${today}`]).toContain('資料作成を完了すること')
  })
})
