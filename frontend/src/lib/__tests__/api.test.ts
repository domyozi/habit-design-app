/**
 * api.ts テスト
 * TASK-0012: フロントエンド共通基盤
 *
 * テストケース:
 * 1. JWTヘッダー付与の確認
 * 2. セッションなし時のヘッダー未付与
 * 3. 401レスポンス時のサインアウト
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'

// supabase モック
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      signOut: vi.fn(),
    },
  },
}))

import { supabase } from '@/lib/supabase'
import apiClient, { apiGet } from '@/lib/api'

describe('APIクライアント (api.ts)', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
    apiClient.defaults.baseURL = 'http://localhost:8000'
    vi.clearAllMocks()
  })

  afterEach(() => {
    mock.restore()
  })

  /**
   * テストケース1: JWTヘッダー付与の確認
   * Given: Supabaseセッションが存在し、access_token が "test-jwt-token"
   * When: apiGet("/habits") を呼び出す
   * Then: Authorization: Bearer test-jwt-token が付与されていること
   */
  it('セッションが存在する場合、Authorization: Bearer {token} ヘッダーが付与される', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'test-jwt-token' } as never },
      error: null,
    })
    mock.onGet('/habits').reply(200, [])

    await apiGet('/habits')

    const request = mock.history.get[0]
    expect(request.headers?.['Authorization']).toBe('Bearer test-jwt-token')
  })

  /**
   * テストケース2: セッションなし時のヘッダー未付与
   * Given: Supabaseセッションが存在しない（null）
   * When: apiGet("/habits") を呼び出す
   * Then: Authorization ヘッダーが付与されないこと
   */
  it('セッションが存在しない場合、Authorization ヘッダーが付与されない', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    })
    mock.onGet('/habits').reply(200, [])

    await apiGet('/habits')

    const request = mock.history.get[0]
    expect(request.headers?.['Authorization']).toBeUndefined()
  })

  /**
   * テストケース3: 401レスポンス時のサインアウト
   * Given: APIがステータス401を返す
   * When: apiGet("/habits") を呼び出す
   * Then: supabase.auth.signOut() が呼び出されること
   */
  it('401レスポンス時に supabase.auth.signOut() が呼ばれる', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    })
    vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null })
    mock.onGet('/habits').reply(401)

    await expect(apiGet('/habits')).rejects.toThrow()

    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('baseURL に /api が含まれる場合でも /api が二重付与されない', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    })
    apiClient.defaults.baseURL = 'http://localhost:8000/api'
    mock.onGet('/habits').reply(200, [])

    await apiGet('/api/habits')

    const request = mock.history.get[0]
    expect(request.url).toBe('/habits')
  })
})
