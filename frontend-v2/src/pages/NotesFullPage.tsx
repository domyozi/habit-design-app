import { Suspense } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { AuthPage } from '@/pages/AuthPage'
import { NotesPage } from '@/pages/NotesPage'
import { useUserContextRoot, UserContextCtx } from '@/lib/user-context'

function NotesApp() {
  const [userContext, updateUserContext] = useUserContextRoot()

  return (
    <UserContextCtx.Provider value={[userContext, updateUserContext]}>
      <div className="flex min-h-screen flex-col bg-[#05080d]">
        {/* Mini header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <a
            href="/"
            className="flex items-center gap-1.5 text-xs text-white/36 transition-colors hover:text-white/70"
          >
            ← アプリに戻る
          </a>
          <p className="text-xs font-semibold tracking-[0.14em] text-white/40">NOTES</p>
          <div className="w-24" />
        </div>

        {/* Notes full area */}
        <div className="flex flex-1 overflow-hidden">
          <Suspense fallback={null}>
            <NotesPage />
          </Suspense>
        </div>
      </div>
    </UserContextCtx.Provider>
  )
}

export function NotesFullPage() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#05080d]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-[#7dd3fc]/60" />
      </div>
    )
  }

  if (!session) return <AuthPage />

  return <NotesApp />
}
