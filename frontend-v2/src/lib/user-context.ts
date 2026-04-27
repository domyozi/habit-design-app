import { useState, useEffect } from 'react'
import { fetchUserContext, patchUserContext } from '@/lib/api'

export type { UserContext } from '@/lib/api'
import type { UserContext } from '@/lib/api'

/**
 * ユーザーコンテキスト（AI コーチ用メモリ）を管理するフック
 *
 * - mount 時に API からロード
 * - 更新時は API に PATCH（localStorage は使用しない）
 */
export function useUserContext(): [UserContext | null, (patch: Partial<UserContext>) => Promise<void>] {
  const [context, setContext] = useState<UserContext | null>(null)

  useEffect(() => {
    fetchUserContext()
      .then(remote => {
        setContext(remote)
      })
      .catch(() => {/* offline — null のまま */})
  }, [])

  const update = async (patch: Partial<UserContext>): Promise<void> => {
    try {
      const updated = await patchUserContext(patch)
      setContext(updated)
    } catch {
      // サイレントに失敗（オフライン耐性）
    }
  }

  return [context, update]
}
