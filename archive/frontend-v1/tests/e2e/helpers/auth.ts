/**
 * E2E テスト用 認証モックヘルパー
 * Supabase の localStorage セッションを注入して認証済み状態にする
 */
import type { Page } from '@playwright/test'

export const TEST_USER_ID = 'test-user-00000000-0000-0000-0000-000000000001'
export const TEST_EMAIL = 'test@example.com'

// exp: 9999999999 (far future) の fake JWT
const FAKE_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJzdWIiOiJ0ZXN0LXVzZXItMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAxIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiYXVkIjoiYXV0aGVudGljYXRlZCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjo5OTk5OTk5OTk5fQ' +
  '.fake_e2e_test_signature'

const SUPABASE_STORAGE_KEY = 'sb-kamzmrqxhbwxmtqinvdy-auth-token'

const FAKE_SESSION = {
  access_token: FAKE_ACCESS_TOKEN,
  refresh_token: 'fake-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 9999999999,
  user: {
    id: TEST_USER_ID,
    email: TEST_EMAIL,
    role: 'authenticated',
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
}

/**
 * ページ初期化時に Supabase セッションを注入し、認証済み状態にする
 * ページ遷移前（goto前）に呼ぶこと
 */
export async function injectAuthSession(page: Page) {
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value))
    },
    { key: SUPABASE_STORAGE_KEY, value: FAKE_SESSION }
  )
}
