import type { Page } from '@playwright/test'

export async function loginAsTestUser(page: Page): Promise<void> {
  await page.goto('/login')
  await page.fill(
    '[data-testid="email-input"]',
    process.env.E2E_TEST_EMAIL ?? 'test@example.com',
  )
  await page.fill(
    '[data-testid="password-input"]',
    process.env.E2E_TEST_PASSWORD ?? 'testpass',
  )
  await page.click('[data-testid="login-button"]')
  await page.waitForURL('**/dashboard')
}
