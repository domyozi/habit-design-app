// Sprint loading-ux: アプリ世界観（warm / paper / accent #ba6f31）に合うスケルトン。
//
// 設計方針:
//   - 画面の構造を残したまま中身だけブランクで動かす（layout shift ゼロ）
//   - shimmer は paperWarm → paper → paperWarm の帯。accent はわずかにのせる
//   - 「LOADING…」のような meta 文字は完全には消さず、控えめに添える
//
// 提供:
//   - SkeletonLine: 任意幅・高さの 1 本ライン
//   - SkeletonBars: KPI / progress バー風のレイアウト（label + bar + meta）
//   - SkeletonGoalCard: Goal カードの形を模した複合スケルトン
//   - LoadingPulse: アクセントの小さなドット 3 つが交互に明滅する待機サイン

import type { CSSProperties } from 'react'
import './skeleton.css'

interface BaseProps {
  /** 幅。string で % や em も可。number は px。 */
  width?: number | string
  /** 高さ px。 */
  height?: number
  /** 追加 style */
  style?: CSSProperties
  /** 角丸 px。デフォルト 3。 */
  radius?: number
}

export function SkeletonLine({ width = '100%', height = 12, style, radius = 3 }: BaseProps) {
  return (
    <span
      className="skel skel-line"
      style={{
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
    />
  )
}

interface BarProps {
  /** label の幅（%）。デフォルト 40。 */
  labelWidth?: number
  /** meta（右上の数字）幅（%）。デフォルト 18。 */
  metaWidth?: number
}

export function SkeletonBars({ labelWidth = 40, metaWidth = 18 }: BarProps) {
  return (
    <div className="skel-bars">
      <div className="skel-bars-row">
        <SkeletonLine width={`${labelWidth}%`} height={11} />
        <SkeletonLine width={`${metaWidth}%`} height={10} />
      </div>
      <SkeletonLine width="100%" height={6} radius={1} style={{ marginTop: 6 }} />
      <SkeletonLine width="36%" height={9} style={{ marginTop: 5, opacity: 0.6 }} />
    </div>
  )
}

interface GoalCardProps {
  /** 配下 KPI ブロック数。デフォルト 2。 */
  kpiCount?: number
}

export function SkeletonGoalCard({ kpiCount = 2 }: GoalCardProps) {
  return (
    <div className="skel-goal-card">
      <div className="skel-goal-header">
        <SkeletonLine width="58%" height={16} />
        <div style={{ marginTop: 8, display: 'flex', gap: 12 }}>
          <SkeletonLine width={56} height={9} />
          <SkeletonLine width={86} height={9} />
          <SkeletonLine width={68} height={9} />
        </div>
      </div>
      <div className="skel-goal-body">
        {Array.from({ length: kpiCount }).map((_, i) => (
          <SkeletonBars key={i} />
        ))}
      </div>
    </div>
  )
}

interface PulseProps {
  /** ステータステキスト。null で非表示。 */
  label?: string | null
  /** モノ文字色 */
  color?: string
}

export function LoadingPulse({ label = '読み込み中', color }: PulseProps) {
  return (
    <div className="skel-pulse" style={color ? { color } : undefined}>
      <span className="skel-pulse-dot" />
      <span className="skel-pulse-dot" style={{ animationDelay: '160ms' }} />
      <span className="skel-pulse-dot" style={{ animationDelay: '320ms' }} />
      {label != null && <span className="skel-pulse-label">{label}</span>}
    </div>
  )
}
