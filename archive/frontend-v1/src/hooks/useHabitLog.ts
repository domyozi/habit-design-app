/**
 * 習慣ログ更新カスタムフック
 * TASK-0015: 習慣チェックリスト操作UI
 *
 * 機能:
 * - PATCH /habits/{id}/log でログを記録
 * - 楽観的更新: クリック直後にUIを更新
 * - エラー時にロールバック
 * - バッジ獲得時に badge_earned を返す
 *
 * 🔵 信頼性レベル: REQ-501/502/901 より
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiPatch } from '@/lib/api'

interface UpdateHabitLogVariables {
  habitId: string
  completed: boolean
  date: string
}

interface HabitLogResponse {
  success: boolean
  data?: {
    log: { completed: boolean; log_date: string }
    streak: number
    badge_earned?: {
      id: string
      badge: { id: string; name: string }
    }
  }
}

/**
 * 習慣ログ更新ミューテーション
 * 楽観的更新でUIを即時反映し、エラー時はロールバック
 */
export function useHabitLog() {
  const queryClient = useQueryClient()

  return useMutation<HabitLogResponse, Error, UpdateHabitLogVariables>({
    mutationFn: ({ habitId, completed, date }) =>
      apiPatch<HabitLogResponse>(`/api/habits/${habitId}/log`, {
        date,
        completed,
        input_method: 'manual',
      }),

    onMutate: async (variables) => {
      // 楽観的更新: 進行中のクエリをキャンセルしてキャッシュを先に更新
      await queryClient.cancelQueries({ queryKey: ['dashboard'] })
      const previousData = queryClient.getQueryData(['dashboard'])

      queryClient.setQueryData(['dashboard'], (old: unknown) => {
        if (!old || typeof old !== 'object') return old
        const data = old as { habits?: Array<{ id: string; today_completed: boolean; today_log: unknown }> }
        return {
          ...data,
          habits: data.habits?.map((habit) =>
            habit.id === variables.habitId
              ? {
                  ...habit,
                  today_completed: variables.completed,
                  today_log: { completed: variables.completed, log_date: variables.date },
                }
              : habit
          ),
        }
      })

      return { previousData }
    },

    onError: (_error, _variables, context) => {
      // エラー時にロールバック
      if (context && typeof context === 'object' && 'previousData' in context) {
        queryClient.setQueryData(['dashboard'], context.previousData)
      }
    },

    onSettled: () => {
      // 成功・失敗に関わらず最新データを取得
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
