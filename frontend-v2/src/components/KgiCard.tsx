import { useState } from 'react'
import type { GoalWithKgi, MetricType } from '@/types'

export interface KgiCardProps {
  goal: GoalWithKgi
  onCurrentValueUpdate?: (goalId: string, value: number) => void
}

// ─── 補助関数 ──────────────────────────────────────────────────────────────

function formatValue(value: number, metricType: MetricType, unit?: string): string {
  if (metricType === 'binary') {
    return value >= 1 ? '達成済み' : '未達成'
  }
  const formatted = metricType === 'percentage'
    ? `${value.toFixed(1)}%`
    : `${value}`
  return unit ? `${formatted} ${unit}` : formatted
}

function getDaysRemainingLabel(daysRemaining: number): string {
  if (daysRemaining >= 0) {
    return `残り ${daysRemaining} 日`
  }
  return `${Math.abs(daysRemaining)} 日超過`
}

// ─── サブコンポーネント: 現在値更新ダイアログ ─────────────────────────────

interface UpdateDialogProps {
  goal: GoalWithKgi
  onSave: (value: number) => void
  onClose: () => void
}

function UpdateDialog({ goal, onSave, onClose }: UpdateDialogProps) {
  const [inputValue, setInputValue] = useState<string>(
    goal.current_value?.toString() ?? '0'
  )

  const handleSave = () => {
    const parsed = parseFloat(inputValue)
    if (!isNaN(parsed)) {
      onSave(parsed)
    }
  }

  if (goal.metric_type === 'binary') {
    return (
      <div role="dialog" aria-modal="true" aria-label="現在値を更新">
        <p>目標を達成しましたか？</p>
        <button onClick={() => onSave(1.0)}>達成済み</button>
        <button onClick={() => onSave(0.0)}>未達成</button>
        <button onClick={onClose}>キャンセル</button>
      </div>
    )
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="現在値を更新">
      <label htmlFor="current-value-input">現在値</label>
      <input
        id="current-value-input"
        type="number"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        min={goal.metric_type === 'percentage' ? 0 : undefined}
        max={goal.metric_type === 'percentage' ? 100 : undefined}
      />
      {goal.unit && <span>{goal.unit}</span>}
      <button onClick={handleSave}>保存</button>
      <button onClick={onClose}>キャンセル</button>
    </div>
  )
}

// ─── メインコンポーネント ──────────────────────────────────────────────────

export function KgiCard({ goal, onCurrentValueUpdate }: KgiCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const handleSave = (value: number) => {
    onCurrentValueUpdate?.(goal.id, value)
    setIsDialogOpen(false)
  }

  // ── 通常 Goal（KGI ではない）の表示 ────────────────────────────────────
  if (!goal.is_kgi) {
    return (
      <div className="goal-card">
        <h3>{goal.title}</h3>
        {goal.description && <p>{goal.description}</p>}
      </div>
    )
  }

  // ── KGI の表示 ──────────────────────────────────────────────────────────
  const achievementRate = goal.achievement_rate ?? 0
  const daysRemaining = goal.days_remaining ?? 0

  return (
    <div className="goal-card kgi-card">
      {/* ヘッダー */}
      <div className="kgi-card__header">
        <h3>{goal.title}</h3>
        {goal.is_expired && (
          <span className="kgi-card__badge kgi-card__badge--expired">
            期限超過
          </span>
        )}
      </div>

      {/* 達成率プログレスバー */}
      <div className="kgi-card__progress" aria-label="達成率">
        <div
          className="kgi-card__progress-bar"
          style={{ width: `${Math.min(achievementRate, 100)}%` }}
          role="progressbar"
          aria-valuenow={achievementRate}
          aria-valuemin={0}
          aria-valuemax={100}
        />
        <span className="kgi-card__progress-label">{achievementRate.toFixed(0)}%</span>
      </div>

      {/* 現在値 / 目標値 */}
      <div className="kgi-card__values">
        <span className="kgi-card__current">
          {formatValue(goal.current_value ?? 0, goal.metric_type!, goal.unit)}
        </span>
        {goal.metric_type !== 'binary' && goal.target_value !== undefined && (
          <>
            <span className="kgi-card__separator"> / </span>
            <span className="kgi-card__target">
              {formatValue(goal.target_value, goal.metric_type!, goal.unit)}
            </span>
          </>
        )}
      </div>

      {/* 残り日数 */}
      {goal.days_remaining !== undefined && (
        <div className="kgi-card__days">
          {getDaysRemainingLabel(daysRemaining)}
        </div>
      )}

      {/* 現在値更新ボタン */}
      <button
        className="kgi-card__update-button"
        onClick={() => setIsDialogOpen(true)}
      >
        現在値を更新
      </button>

      {/* 更新ダイアログ */}
      {isDialogOpen && (
        <UpdateDialog
          goal={goal}
          onSave={handleSave}
          onClose={() => setIsDialogOpen(false)}
        />
      )}
    </div>
  )
}

export default KgiCard
