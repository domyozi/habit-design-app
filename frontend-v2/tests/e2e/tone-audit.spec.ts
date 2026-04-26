import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, type Page } from '@playwright/test'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const OUT_DIR = path.resolve(__dirname, '../../img')

const save = async (page: Page, name: string) => {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  await page.screenshot({
    path: path.join(OUT_DIR, name),
    fullPage: true,
  })
}

test.describe('tone audit screenshots', () => {
  test('capture key screens', async ({ page }) => {
    await page.goto('/')
    await page.setViewportSize({ width: 430, height: 932 })
    const navButtons = page.locator('nav').last().getByRole('button')

    await save(page, 'tone-01-home.png')

    await navButtons.nth(1).click()
    await save(page, 'tone-02-morning.png')

    await navButtons.nth(2).click()
    await save(page, 'tone-03-evening.png')

    await navButtons.nth(3).click()
    await save(page, 'tone-04-more.png')

    await page.getByRole('button', { name: '月次レビュー・日報' }).click()
    await save(page, 'tone-05-monthly.png')

    await navButtons.nth(3).click()
    await page.getByRole('button', { name: '設定・AI支援' }).click()
    await save(page, 'tone-06-settings.png')

    await navButtons.nth(3).click()
    await page.getByRole('button', { name: 'Wanna Be' }).click()
    await save(page, 'tone-07-wannabe.png')

    await page.setViewportSize({ width: 1440, height: 1024 })
    await page.goto('/')
    const desktopRail = page.locator('aside').first()
    await save(page, 'tone-08-desktop-home.png')

    await desktopRail.getByRole('button', { name: /Monthly/i }).click()
    await save(page, 'tone-09-desktop-monthly.png')

    await desktopRail.getByRole('button', { name: /Settings/i }).click()
    await save(page, 'tone-10-desktop-settings.png')
  })
})
