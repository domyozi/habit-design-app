import { expect, test } from '@playwright/test'

test.describe('login visual review', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      '未来の自分に、'
    )
  })

  test('renders the launch view without visual regressions', async ({ page }) => {
    await expect(page).toHaveScreenshot('login-shell.png', {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    })
  })

  test('keeps the primary CTA visible in the first viewport', async ({ page }) => {
    const cta = page.getByTestId('google-sign-in')
    await expect(cta).toBeVisible()
    await expect(cta).toHaveScreenshot('login-primary-cta.png', {
      animations: 'disabled',
      caret: 'hide',
    })
  })
})
