import { useState, useEffect, useCallback } from 'react'
import { fetchHealthSummary, fetchHealthToken, regenerateHealthToken, type HealthSummary } from '@/lib/api'

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
  const [token, setToken] = useState<string | null>(null)
  const [tokenLoading, setTokenLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [setupOpen, setSetupOpen] = useState(true)

  const API_URL = import.meta.env.VITE_API_BASE_URL ?? 'https://api.vekto.jp'

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, t] = await Promise.all([fetchHealthSummary(), fetchHealthToken()])
      setSummary(s)
      setToken(t.token)
      if (Object.keys(s.latest).length > 0) setSetupOpen(false)
    } catch {
      setError('データの取得に失敗しました。再度お試しください。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleRegenerate = async () => {
    if (!confirm('トークンを再生成すると、既存のショートカットが使えなくなります。続けますか？')) return
    setTokenLoading(true)
    try {
      const t = await regenerateHealthToken()
      setToken(t.token)
    } finally {
      setTokenLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!token) return
    await navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const empty: HealthSummary = { latest: {}, weekly: {} }
  const s = summary ?? empty

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

      {/* Setup */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#0b1320]/80">
        <button
          type="button"
          onClick={() => setSetupOpen(o => !o)}
          className="flex w-full items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#34d399]/80">ショートカット連携</span>
            {Object.keys(s.latest).length > 0 && (
              <span className="rounded-full bg-[#34d399]/20 px-1.5 py-0.5 text-[9px] text-[#34d399]">接続済み</span>
            )}
          </div>
          <span className="text-[10px] text-white/30">{setupOpen ? '▲' : '▼'}</span>
        </button>

        {setupOpen && (
          <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 space-y-4">
            {/* Token */}
            <div>
              <p className="mb-1.5 text-[10px] text-white/40">あなたのトークン</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-hidden rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 text-[11px] font-mono text-white/60 truncate">
                  {token ?? '読込中...'}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!token}
                  className="shrink-0 rounded-lg border border-[#34d399]/30 bg-[#34d399]/10 px-3 py-2 text-[10px] font-semibold text-[#34d399] transition-colors hover:bg-[#34d399]/20"
                >
                  {copied ? '✓ コピー済' : 'コピー'}
                </button>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={tokenLoading}
                  className="shrink-0 rounded-lg border border-white/[0.06] px-3 py-2 text-[10px] text-white/30 hover:text-white/60 transition-colors"
                >
                  {tokenLoading ? '...' : '再生成'}
                </button>
              </div>
            </div>

            {/* Steps */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-white/50">設定手順</p>
              {[
                { n: 1, text: 'iPhoneの「ショートカット」アプリを開く' },
                { n: 2, text: '「オートメーション」→「新規オートメーション」→「毎日（例: AM 7:00）」' },
                { n: 3, text: '「URLの内容を取得」アクションを追加' },
                { n: 4, text: `URL: ${API_URL}/api/integrations/batch` },
                { n: 5, text: 'メソッド: POST' },
                { n: 6, text: `ヘッダー: X-Shortcuts-Token = ${token ?? '{トークン}'}` },
                { n: 7, text: '本文(JSON): 取得したいHealthKitデータを{"metrics":[{"metric":"steps","value":歩数,"unit":"count"},...]}形式で組み立て' },
              ].map(({ n, text }) => (
                <div key={n} className="flex gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[9px] font-bold text-white/40">{n}</span>
                  <p className="text-[11px] leading-relaxed text-white/50">{text}</p>
                </div>
              ))}
            </div>

            {/* Supported metrics */}
            <div>
              <p className="mb-1.5 text-[10px] text-white/40">送信できる指標一覧 (metric値)</p>
              <div className="flex flex-wrap gap-1">
                {['steps','distance_walked','active_calories','resting_calories','workout_minutes',
                  'heart_rate','resting_heart_rate','hrv','sleep_hours',
                  'weight','bmi','body_fat','blood_oxygen','respiratory_rate','mindful_minutes'].map(m => (
                  <code key={m} className="rounded border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-white/40">{m}</code>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {loading && !summary && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-[#34d399]/60" />
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
