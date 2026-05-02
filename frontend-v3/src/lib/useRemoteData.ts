import { useEffect, useState } from 'react'
import { ApiError } from './api'

export interface RemoteState<T> {
  data: T | null
  loading: boolean
  error: ApiError | null
}

/**
 * Fetch a backend resource on mount. Returns `data: null` and an `error` on
 * failure so callers can fall back to mock data without crashing the UI.
 */
export function useRemoteData<T>(fetcher: () => Promise<T>, deps: unknown[] = []): RemoteState<T> {
  const [state, setState] = useState<RemoteState<T>>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    setState({ data: null, loading: true, error: null })
    fetcher()
      .then((data) => {
        if (cancelled) return
        setState({ data, loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const apiErr = err instanceof ApiError ? err : new ApiError(0, String(err))
        setState({ data: null, loading: false, error: apiErr })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
