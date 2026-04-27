import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthCallback } from '@/App'

const { mockSetSession, mockExchangeCodeForSession, mockGetSession } = vi.hoisted(() => ({
  mockSetSession: vi.fn(),
  mockExchangeCodeForSession: vi.fn(),
  mockGetSession: vi.fn(),
}))

vi.mock('@/store/authStore', () => ({
  useAuthStore: vi.fn((selector: (state: { setSession: typeof mockSetSession }) => unknown) =>
    selector({
      setSession: mockSetSession,
    })
  ),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      getSession: mockGetSession,
    },
  },
}))

describe('AuthCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should exchange the OAuth code, persist the session, and navigate to the dashboard', async () => {
    const session = { access_token: 'token' }
    mockExchangeCodeForSession.mockResolvedValue({ data: { session }, error: null })
    mockGetSession.mockResolvedValue({ data: { session }, error: null })

    render(
      <MemoryRouter initialEntries={['/auth/callback?code=test-code']}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/" element={<div>dashboard</div>} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(mockExchangeCodeForSession).toHaveBeenCalledWith('test-code')
      expect(mockSetSession).toHaveBeenCalledWith(session)
      expect(screen.getByText('dashboard')).toBeInTheDocument()
    })
  })

  it('should show an error when the callback cannot produce a session', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null })

    render(
      <MemoryRouter initialEntries={['/auth/callback?code=test-code']}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('認証の完了に失敗しました。もう一度お試しください。')).toBeInTheDocument()
    })
  })
})
