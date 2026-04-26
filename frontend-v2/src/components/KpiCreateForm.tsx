import { useState } from 'react'
import type { CreateKpiRequest, MetricType, TrackingFrequency } from '@/types'
import { createKpi } from '@/lib/api'

export interface KpiCreateFormProps {
  goalId: string
  onSuccess: () => void
  onClose: () => void
}

export function KpiCreateForm({ goalId, onSuccess, onClose }: KpiCreateFormProps) {
  const [form, setForm] = useState({
    title: '',
    metric_type: 'numeric' as MetricType,
    target_value: '',
    unit: '',
    tracking_frequency: 'daily' as TrackingFrequency,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ target_value?: string }>({})

  const isBinary = form.metric_type === 'binary'

  const validate = (): boolean => {
    const newErrors: { target_value?: string } = {}
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
    if (!form.title.trim() || !validate()) return

    setIsSubmitting(true)
    try {
      const req: CreateKpiRequest = {
        goal_id: goalId,
        title: form.title.trim(),
        metric_type: form.metric_type,
        target_value: !isBinary && form.target_value !== ''
          ? parseFloat(form.target_value)
          : undefined,
        unit: form.unit || undefined,
        tracking_frequency: form.tracking_frequency,
      }
      await createKpi(req)
      onSuccess()
    } catch {
      // エラーハンドリング
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="KPI追加">
      <h2>KPI を追加</h2>
      <form onSubmit={handleSubmit}>
        {/* タイトル（必須） */}
        <label htmlFor="kpi-title">タイトル *</label>
        <input
          id="kpi-title"
          type="text"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />

        {/* 指標タイプ */}
        <label htmlFor="kpi-metric-type">指標タイプ</label>
        <select
          id="kpi-metric-type"
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
            <label htmlFor="kpi-target-value">目標値</label>
            <input
              id="kpi-target-value"
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
            <label htmlFor="kpi-unit">単位</label>
            <input
              id="kpi-unit"
              type="text"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </>
        )}

        {/* 追跡頻度 */}
        <label htmlFor="kpi-frequency">追跡頻度</label>
        <select
          id="kpi-frequency"
          value={form.tracking_frequency}
          onChange={(e) => setForm({ ...form, tracking_frequency: e.target.value as TrackingFrequency })}
        >
          <option value="daily">毎日</option>
          <option value="weekly">毎週</option>
          <option value="monthly">毎月</option>
        </select>

        <button type="submit" disabled={!form.title.trim() || isSubmitting}>
          {isSubmitting ? '追加中...' : '追加'}
        </button>
        <button type="button" onClick={onClose}>キャンセル</button>
      </form>
    </div>
  )
}

export default KpiCreateForm
