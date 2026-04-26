import { useState } from 'react'
import type { SetKgiRequest, MetricType } from '@/types'
import { patchGoalKgi } from '@/lib/api'

export interface KgiSetupFormProps {
  goalId: string
  goalTitle: string
  onSuccess: () => void
  onClose: () => void
}

interface FormState {
  metric_type: MetricType
  target_value: string
  unit: string
  target_date: string
  current_value: string
}

interface FormErrors {
  target_date?: string
  target_value?: string
}

export function KgiSetupForm({ goalId, goalTitle, onSuccess, onClose }: KgiSetupFormProps) {
  const [form, setForm] = useState<FormState>({
    metric_type: 'numeric',
    target_value: '',
    unit: '',
    target_date: '',
    current_value: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validate = (): boolean => {
    const newErrors: FormErrors = {}
    if (!form.target_date) {
      newErrors.target_date = 'TARGET_DATE_REQUIRED'
    }
    if (form.metric_type === 'percentage' && form.target_value !== '') {
      const val = parseFloat(form.target_value)
      if (val < 0 || val > 100) {
        newErrors.target_value = 'PERCENTAGE_OUT_OF_RANGE'
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    try {
      const req: SetKgiRequest = {
        metric_type: form.metric_type,
        target_date: form.target_date,
        target_value: form.target_value !== '' ? parseFloat(form.target_value) : undefined,
        unit: form.unit || undefined,
        current_value: form.current_value !== '' ? parseFloat(form.current_value) : undefined,
      }
      await patchGoalKgi(goalId, req)
      onSuccess()
    } catch {
      // エラーハンドリング（API エラー）
    } finally {
      setIsSubmitting(false)
    }
  }

  const isBinary = form.metric_type === 'binary'

  return (
    <div role="dialog" aria-modal="true" aria-label="KGI設定">
      <h2>{goalTitle} を KGI として設定</h2>
      <form onSubmit={handleSubmit}>
        {/* 指標タイプ */}
        <label htmlFor="metric-type">指標タイプ</label>
        <select
          id="metric-type"
          value={form.metric_type}
          onChange={(e) => setForm({ ...form, metric_type: e.target.value as MetricType })}
        >
          <option value="numeric">数値</option>
          <option value="percentage">パーセンテージ</option>
          <option value="binary">達成/未達成</option>
        </select>

        {/* 目標値（binary 以外） */}
        {!isBinary && (
          <>
            <label htmlFor="target-value">目標値</label>
            <input
              id="target-value"
              type="number"
              value={form.target_value}
              min={form.metric_type === 'percentage' ? 0 : undefined}
              max={form.metric_type === 'percentage' ? 100 : undefined}
              onChange={(e) => setForm({ ...form, target_value: e.target.value })}
            />
            {errors.target_value === 'PERCENTAGE_OUT_OF_RANGE' && (
              <span role="alert">目標値は 0〜100 の範囲で入力してください</span>
            )}
          </>
        )}

        {/* 単位（binary 以外） */}
        {!isBinary && (
          <>
            <label htmlFor="unit">単位</label>
            <input
              id="unit"
              type="text"
              value={form.unit}
              maxLength={20}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="例: km, 冊, 件"
            />
          </>
        )}

        {/* 目標日（必須） */}
        <label htmlFor="target-date">目標日 *</label>
        <input
          id="target-date"
          type="date"
          value={form.target_date}
          onChange={(e) => setForm({ ...form, target_date: e.target.value })}
        />
        {errors.target_date === 'TARGET_DATE_REQUIRED' && (
          <span role="alert">目標日は必須です</span>
        )}

        {/* 現在値（任意、binary 以外） */}
        {!isBinary && (
          <>
            <label htmlFor="current-value">現在値（任意）</label>
            <input
              id="current-value"
              type="number"
              value={form.current_value}
              onChange={(e) => setForm({ ...form, current_value: e.target.value })}
            />
          </>
        )}

        <button
          type="submit"
          disabled={!form.target_date || isSubmitting}
        >
          {isSubmitting ? '保存中...' : '保存'}
        </button>
        <button type="button" onClick={onClose}>キャンセル</button>
      </form>
    </div>
  )
}

export default KgiSetupForm
