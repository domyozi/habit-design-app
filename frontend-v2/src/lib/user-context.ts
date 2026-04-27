import { useState, useEffect, useContext, createContext, useRef } from 'react'
import { fetchUserContext, patchUserContext } from '@/lib/api'

export type { UserContext } from '@/lib/api'
import type { UserContext } from '@/lib/api'

// ─── シングルトン Context ─────────────────────────────────────
// 全コンポーネントが同じ userContext 状態を共有する

type UserContextValue = [UserContext | null, (patch: Partial<UserContext>) => Promise<void>]

export const UserContextCtx = createContext<UserContextValue>([null, async () => {}])

/**
 * UserContextCtx.Provider の内側で使う。
 * Provider が mount 時に API からロードし、全子コンポーネントで状態を共有する。
 */
export function useUserContext(): UserContextValue {
  return useContext(UserContextCtx)
}

/**
 * App のルートで1回だけ呼び、Provider に渡す値を生成する。
 * useUserContext() とは別物 — Provider 内部用。
 */
export function useUserContextRoot(): UserContextValue {
  const [context, setContext] = useState<UserContext | null>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    fetchUserContext()
      .then(remote => setContext(remote))
      .catch(() => {/* offline — null のまま */})
  }, [])

  const update = async (patch: Partial<UserContext>): Promise<void> => {
    try {
      const updated = await patchUserContext(patch)
      setContext(updated)
    } catch {
      // サイレントに失敗
    }
  }

  return [context, update]
}
