import { useState } from 'react'
import { upsertKpiLog } from '@/lib/api'
import type { KpiWithTodayStatus } from '@/types'

interface KpiLogInputProps {
  kpi: KpiWithTodayStatus
  onLog: (kpiId: string, value: number) => void
}

export function KpiLogInput({ kpi, onLog }: KpiLogInputProps) {
  const today = new Date().toISOString().split('T')[0]
  const [inputValue, setInputValue] = useState('')
  const [isCompleted, setIsCompleted] = useState(kpi.today_completed)
  const [displayValue, setDisplayValue] = useState<number | null>(kpi.today_value)
  const [isEditing, setIsEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (value: number) => {
    const prevCompleted = isCompleted
    const prevValue = displayValue
    setIsCompleted(true)
    setDisplayValue(value)
    setIsEditing(false)
    setError(null)
    setIsSubmitting(true)

    try {
      await upsertKpiLog(kpi.id, {
        log_date: today,
        value,
        input_method: 'manual',
      })
      onLog(kpi.id, value)
    } catch {
      setIsCompleted(prevCompleted)
      setDisplayValue(prevValue)
      setError('記録に失敗しました。再度お試しください。')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleNumericSubmit = () => {
    const num = parseFloat(inputValue)
    if (isNaN(num)) return
    handleSubmit(num)
    setInputValue('')
  }

  const handlePercentageSubmit = () => {
    const num = parseFloat(inputValue)
    if (isNaN(num) || num < 0 || num > 100) return
    handleSubmit(num)
    setInputValue('')
  }

  const isNumericValid = () => {
    const num = parseFloat(inputValue)
    return !isNaN(num) && inputValue.trim() !== ''
  }

  const isPercentageValid = () => {
    const num = parseFloat(inputValue)
    return !isNaN(num) && num >= 0 && num <= 100
  }

  const isPercentageOutOfRange = () => {
    const num = parseFloat(inputValue)
    return inputValue !== '' && !isNaN(num) && (num < 0 || num > 100)
  }

  if (isCompleted && !isEditing) {
    return (
      <div data-testid={`kpi-log-completed-${kpi.id}`} className="flex items-center gap-2">
        <span className="font-medium">{kpi.title}</span>
        <span data-testid={`kpi-log-value-${kpi.id}`}>
          {kpi.metric_type === 'binary' ? '完了' : `${displayValue}${kpi.unit ? ` ${kpi.unit}` : ''}`}
        </span>
        <button
          data-testid={`kpi-edit-button-${kpi.id}`}
          onClick={() => setIsEditing(true)}
          className="text-sm text-blue-500 underline"
        >
          編集
        </button>
        {kpi.connected_habits.length > 0 && (
          <span data-testid={`kpi-habit-link-${kpi.id}`} className="text-xs text-gray-500">
            → {kpi.connected_habits.map((h) => h.habit_title).join(', ')} に連動
          </span>
        )}
      </div>
    )
  }

  return (
    <div data-testid={`kpi-log-input-${kpi.id}`} className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="font-medium">{kpi.title}</span>
        {kpi.connected_habits.length > 0 && (
          <span data-testid={`kpi-habit-link-${kpi.id}`} className="text-xs text-gray-500">
            → {kpi.connected_habits.map((h) => h.habit_title).join(', ')} に連動
          </span>
        )}
      </div>

      {kpi.metric_type === 'numeric' && (
        <div className="flex items-center gap-2">
          <input
            data-testid={`kpi-numeric-input-${kpi.id}`}
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="値を入力"
            className="border rounded px-2 py-1 w-24"
          />
          {kpi.unit && <span>{kpi.unit}</span>}
          <button
            data-testid={`kpi-submit-button-${kpi.id}`}
            onClick={handleNumericSubmit}
            disabled={!isNumericValid() || isSubmitting}
            className="bg-blue-500 text-white px-3 py-1 rounded disabled:opacity-50"
          >
            記録
          </button>
        </div>
      )}

      {kpi.metric_type === 'percentage' && (
        <div className="flex items-center gap-2">
          <input
            data-testid={`kpi-percentage-input-${kpi.id}`}
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="0〜100"
            min={0}
            max={100}
            className="border rounded px-2 py-1 w-20"
          />
          <span>%</span>
          <button
            data-testid={`kpi-submit-button-${kpi.id}`}
            onClick={handlePercentageSubmit}
            disabled={!isPercentageValid() || isSubmitting}
            className="bg-blue-500 text-white px-3 py-1 rounded disabled:opacity-50"
          >
            記録
          </button>
          {isPercentageOutOfRange() && (
            <span
              data-testid={`kpi-percentage-error-${kpi.id}`}
              className="text-red-500 text-sm"
            >
              0〜100の値を入力してください
            </span>
          )}
        </div>
      )}

      {kpi.metric_type === 'binary' && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            data-testid={`kpi-binary-checkbox-${kpi.id}`}
            type="checkbox"
            checked={isCompleted}
            onChange={() => handleSubmit(1)}
            className="w-5 h-5"
          />
          <span>完了</span>
        </label>
      )}

      {error && (
        <p data-testid={`kpi-error-${kpi.id}`} className="text-red-500 text-sm">
          {error}
        </p>
      )}
    </div>
  )
}

export default KpiLogInput
