import { useState } from 'react'
import { linkKpiHabits } from '@/lib/api'

export interface Habit {
  id: string
  title: string
}

export interface HabitLinkModalProps {
  kpiId: string
  kpiTitle: string
  availableHabits: Habit[]
  initialSelectedIds?: string[]
  onSuccess: (selectedIds: string[]) => void
  onClose: () => void
}

export function HabitLinkModal({
  kpiId,
  kpiTitle,
  availableHabits,
  initialSelectedIds = [],
  onSuccess,
  onClose,
}: HabitLinkModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(initialSelectedIds)
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  const toggleHabit = (habitId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(habitId)) {
        next.delete(habitId)
      } else {
        next.add(habitId)
      }
      return next
    })
  }

  const handleSave = async () => {
    setIsSubmitting(true)
    try {
      const ids = Array.from(selectedIds)
      await linkKpiHabits(kpiId, ids)
      onSuccess(ids)
    } catch {
      // エラーハンドリング
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="関連習慣を選択">
      <h2>{kpiTitle} に関連する習慣を選択</h2>
      <ul>
        {availableHabits.map((habit) => (
          <li key={habit.id}>
            <label>
              <input
                type="checkbox"
                checked={selectedIds.has(habit.id)}
                onChange={() => toggleHabit(habit.id)}
                aria-label={habit.title}
              />
              {habit.title}
            </label>
          </li>
        ))}
      </ul>
      <button onClick={handleSave} disabled={isSubmitting}>
        {isSubmitting ? '保存中...' : '保存'}
      </button>
      <button onClick={onClose}>キャンセル</button>
    </div>
  )
}

export default HabitLinkModal
