import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchUserProfile, patchUserProfile, type UpdateUserProfileRequest, type UserProfile } from '@/lib/api'

interface UseUserProfileReturn {
  profile: UserProfile | null
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
  update: (patch: UpdateUserProfileRequest) => Promise<UserProfile | null>
}

/**
 * 認証済みユーザの user_profiles レコードを取得・更新するフック。
 * App ルートで session が確立した後に呼び出す。
 */
export const useUserProfile = (enabled: boolean): UseUserProfileReturn => {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState<boolean>(enabled)
  const [error, setError] = useState<Error | null>(null)
  const loadedRef = useRef(false)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await fetchUserProfile()
      setProfile(next)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setProfile(null)
      setLoading(false)
      loadedRef.current = false
      return
    }
    if (loadedRef.current) return
    loadedRef.current = true
    void refetch()
  }, [enabled, refetch])

  const update = useCallback(async (patch: UpdateUserProfileRequest): Promise<UserProfile | null> => {
    try {
      const updated = await patchUserProfile(patch)
      setProfile(updated)
      return updated
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
      return null
    }
  }, [])

  return { profile, loading, error, refetch, update }
}
