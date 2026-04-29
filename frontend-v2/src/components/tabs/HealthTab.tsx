import { useState, useEffect, useCallback } from 'react'
import { fetchHealthSummary, type HealthSummary } from '@/lib/api'

export const HEALTH_CONNECTED_KEY = 'health:connected'

// ─── スパークライン ──────────────────────────────────────────
function Sparkline({ points, color = '#34d399' }: { points: (number | null)[]; color?: string }) {
  const valid = points.filter((v): v is number => v !== null)
  if (valid.length < 2) return <div className="h-8 w-full opacity-20 text-center text-[9px] text-white/40">データなし</div>

  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const range = max - min || 1
  const w = 120
  const h = 32
  const step = w / (points.length - 1)

  const pathParts: string[] = []
  points.forEach((v, i) => {
    if (v === null) return
    const x = i * step
    const y = h - ((v - min) / range) * (h - 4) - 2
    pathParts.push(pathParts.length === 0 ? `M${x},${y}` : `L${x},${y}`)
  })

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none">
      <path d={pathParts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── メトリクスカード ────────────────────────────────────────
interface MetricCardProps {
  label: string
  metricKey: string
  unit: string
  format?: (v: number) => string
  summary: HealthSummary
  color?: string
}

function MetricCard({ label, metricKey, unit, format, summary, color = '#34d399' }: MetricCardProps) {
  const latest = summary.latest[metricKey]
  const weekly = summary.weekly[metricKey] ?? []
  const displayValue = latest ? (format ? format(latest.value) : latest.value.toLocaleString()) : '—'
  const weeklyValues = weekly.map(p => p.value)

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: `${color}99` }}>{label}</p>
      <p className="mt-1 text-xl font-bold text-white/90">
        {displayValue}
        {latest && <span className="ml-1 text-[11px] font-normal text-white/36">{unit}</span>}
      </p>
      {weeklyValues.some(v => v !== null) && (
        <div className="mt-2">
          <Sparkline points={weeklyValues} color={color} />
        </div>
      )}
      {latest && (
        <p className="mt-1 text-[9px] text-white/24">
          {new Date(latest.recorded_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  )
}

// ─── メインコンポーネント ────────────────────────────────────
export function HealthTab() {
  const [summary, setSummary] = useState<HealthSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await fetchHealthSummary()
      setSummary(s)
      if (Object.keys(s.latest).length > 0) {
        localStorage.setItem(HEALTH_CONNECTED_KEY, 'true')
      }
    } catch {
      setError('データの取得に失敗しました。再度お試しください。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const empty: HealthSummary = { latest: {}, weekly: {} }
  const s = summary ?? empty
  const hasData = Object.keys(s.latest).length > 0

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-4 pb-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base font-semibold text-white/88">ヘルス</p>
          <p className="text-[11px] text-white/36">Apple Health データ</p>
        </div>
        <button type="button" onClick={load} className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-[10px] text-white/36 hover:text-white/60 transition-colors">
          更新
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {loading && !summary && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-[#34d399]/60" />
        </div>
      )}

      {!loading && !hasData && (
        <div className="rounded-2xl border border-dashed border-white/[0.08] px-6 py-10 text-center">
          <p className="text-sm text-white/40">データがまだありません</p>
          <p className="mt-1 text-[11px] text-white/24">設定 → Apple Health 連携 からショートカットを設定してください</p>
        </div>
      )}

      {/* 活動量 */}
      <section>
        <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#38bdf8]/70">活動量</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricCard label="歩数" metricKey="steps" unit="歩" format={v => v.toLocaleString()} summary={s} color="#38bdf8" />
          <MetricCard label="歩行距離" metricKey="distance_walked" unit="km" format={v => v.toFixed(1)} summary={s} color="#38bdf8" />
          <MetricCard label="消費カロリー" metricKey="active_calories" unit="kcal" format={v => Math.round(v).toLocaleString()} summary={s} color="#38bdf8" />
          <MetricCard label="運動時間" metricKey="workout_minutes" unit="min" summary={s} color="#38bdf8" />
        </div>
      </section>

      {/* 心臓 */}
      <section>
        <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#f472b6]/70">心臓</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MetricCard label="心拍数" metricKey="heart_rate" unit="bpm" summary={s} color="#f472b6" />
          <MetricCard label="安静時心拍数" metricKey="resting_heart_rate" unit="bpm" summary={s} color="#f472b6" />
          <MetricCard label="HRV" metricKey="hrv" unit="ms" summary={s} color="#f472b6" />
        </div>
      </section>

      {/* 睡眠 */}
      <section>
        <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#a78bfa]/70">睡眠</p>
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="睡眠時間" metricKey="sleep_hours" unit="h" format={v => v.toFixed(1)} summary={s} color="#a78bfa" />
        </div>
      </section>

      {/* 身体計測 */}
      <section>
        <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#fbd38d]/70">身体計測</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MetricCard label="体重" metricKey="weight" unit="kg" format={v => v.toFixed(1)} summary={s} color="#fbd38d" />
          <MetricCard label="BMI" metricKey="bmi" unit="" format={v => v.toFixed(1)} summary={s} color="#fbd38d" />
          <MetricCard label="体脂肪率" metricKey="body_fat" unit="%" format={v => v.toFixed(1)} summary={s} color="#fbd38d" />
        </div>
      </section>

      {/* ウェルネス */}
      <section>
        <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#34d399]/70">ウェルネス</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MetricCard label="血中酸素" metricKey="blood_oxygen" unit="%" format={v => v.toFixed(0)} summary={s} color="#34d399" />
          <MetricCard label="呼吸数" metricKey="respiratory_rate" unit="/min" format={v => v.toFixed(0)} summary={s} color="#34d399" />
          <MetricCard label="マインドフル" metricKey="mindful_minutes" unit="min" summary={s} color="#34d399" />
        </div>
      </section>

    </div>
  )
}
