import { useMemo } from 'react'
import { useTimeContext } from '@/lib/timeContext'
import { useBossStorage, useTodayStorage, thisMonthKeys, yesterdayKey } from '@/lib/storage'
import { byTiming, useTodoDefinitions } from '@/lib/todos'
import type { TabId } from '@/types'

// ─── 昨日データ読み取り ──────────────────────────────────────
const readYesterdayChecked = (slot: 'morning' | 'evening'): string[] => {
  const yk = yesterdayKey()
  const newKey = `daily:${yk}:${slot}:checked`
  const oldKey = `${slot}:checked:${yk}`
  const raw = localStorage.getItem(newKey) ?? localStorage.getItem(oldKey)
  if (!raw) return []
  try { return JSON.parse(raw) as string[] } catch { return [] }
}

// ─── FocusCard ───────────────────────────────────────────────
const FocusCard = ({
  boss,
  bossCompleted,
  todayDone,
  todayTotal,
  morningDone,
  eveningDone,
  period,
  onNavigate,
}: {
  boss: string | null
  bossCompleted: boolean
  todayDone: number
  todayTotal: number
  morningDone: boolean
  eveningDone: boolean
  period: 'morning' | 'evening' | 'other'
  onNavigate: (tab: TabId) => void
}) => {
  const pct = todayTotal > 0 ? Math.round((todayDone / todayTotal) * 100) : 0
  const barWidth = `${pct}%`

  const accentColor = morningDone && eveningDone
    ? '#22c55e'
    : period === 'evening' ? '#a78bfa' : '#7dd3fc'

  const bgGradient = morningDone && eveningDone
    ? 'radial-gradient(circle at top left, rgba(34,197,94,0.10) 0%, transparent 50%), linear-gradient(180deg, rgba(9,16,27,0.98), rgba(8,13,22,0.94))'
    : period === 'evening'
      ? 'radial-gradient(circle at top left, rgba(167,139,250,0.12) 0%, transparent 50%), linear-gradient(180deg, rgba(9,16,27,0.98), rgba(8,13,22,0.94))'
      : 'radial-gradient(circle at top left, rgba(125,211,252,0.14) 0%, transparent 50%), linear-gradient(180deg, rgba(9,16,27,0.98), rgba(8,13,22,0.94))'

  const label = morningDone && eveningDone
    ? 'ALL DONE'
    : period === 'evening' ? 'EVENING' : 'MORNING'

  const ctaTab: TabId = period === 'evening' ? 'evening' : 'morning'
  const ctaLabel = period === 'evening' ? '夜の振り返りを開く' : '朝のルーティンを開く'

  return (
    <div
      className="rounded-[28px] border px-5 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
      style={{
        borderColor: `${accentColor}22`,
        background: bgGradient,
      }}
    >
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-3">
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.28em]"
          style={{ color: `${accentColor}aa` }}
        >
          {label}
        </p>
        <span
          className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
          style={{
            borderColor: `${accentColor}30`,
            backgroundColor: `${accentColor}12`,
            color: accentColor,
          }}
        >
          {bossCompleted ? 'closed' : 'focus'}
        </span>
      </div>

      {/* Primary Target */}
      {boss ? (
        <p className={['mt-3 text-2xl font-semibold leading-snug', bossCompleted ? 'text-white/40 line-through' : 'text-white'].join(' ')}>
          {boss}
        </p>
      ) : (
        <div className="mt-3">
          <p className="text-lg text-white/40 italic">今日の焦点を設定してください</p>
          {/* F-05: button to navigate to morning tab to set target */}
          <button
            type="button"
            onClick={() => onNavigate('morning')}
            className="mt-2 rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors"
            style={{
              borderColor: `${accentColor}35`,
              backgroundColor: `${accentColor}12`,
              color: accentColor,
            }}
          >
            目標を設定する →
          </button>
        </div>
      )}

      {/* Progress bar */}
      <div className="mt-5 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-white/40">完了</span>
          <span className="text-[11px] font-mono text-white/60">{todayDone} / {todayTotal}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: barWidth, backgroundColor: accentColor }}
          />
        </div>
        <p
          className="text-right text-[11px] font-semibold"
          style={{ color: `${accentColor}cc` }}
        >
          {pct}%
        </p>
      </div>

      {/* CTA */}
      {!(morningDone && eveningDone) && (
        <button
          type="button"
          onClick={() => onNavigate(ctaTab)}
          className="mt-5 rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors"
          style={{
            borderColor: `${accentColor}35`,
            backgroundColor: `${accentColor}12`,
            color: accentColor,
          }}
        >
          {ctaLabel} →
        </button>
      )}
    </div>
  )
}

// ─── CoachInsightCard ────────────────────────────────────────
const CoachInsightCard = ({
  lines,
}: {
  lines: string[]
}) => (
  <div className="rounded-[28px] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(12,18,29,0.97),rgba(9,14,22,0.93))] px-5 py-5">
    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/35">Coach</p>
    <div className="mt-3 space-y-2">
      {lines.filter(Boolean).slice(0, 2).map((line, i) => (
        <p key={i} className="text-sm leading-relaxed text-white/68">
          {line}
        </p>
      ))}
    </div>
  </div>
)

// ─── MonthlyMiniCard ─────────────────────────────────────────
const MonthlyMiniCard = ({ onNavigate }: { onNavigate: (tab: TabId) => void }) => {
  const daysCompleted = useMemo(() => {
    let count = 0
    for (const dk of thisMonthKeys()) {
      const raw = localStorage.getItem(`daily:${dk}:morning:checked`) ?? localStorage.getItem(`morning:checked:${dk}`)
      if (raw) {
        try { if ((JSON.parse(raw) as string[]).length > 0) count++ } catch { /* noop */ }
      }
    }
    return count
  }, [])

  const dayOfMonth = new Date().getDate()
  const pct = dayOfMonth > 0 ? Math.min(100, Math.round((daysCompleted / dayOfMonth) * 100)) : 0

  return (
    <button
      type="button"
      onClick={() => onNavigate('monthly')}
      className="w-full rounded-[28px] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(12,18,29,0.97),rgba(9,14,22,0.93))] px-5 py-5 text-left"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/35">Monthly</p>
      <div className="mt-3">
        <span className="text-3xl font-bold text-white">{daysCompleted}</span>
        <span className="ml-1 text-[11px] text-white/36">/ {dayOfMonth} 日</span>
      </div>
      <p className="mt-0.5 text-[11px] text-white/30">朝ルーティン完了</p>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: pct >= 80 ? '#22c55e' : '#7dd3fc' }}
        />
      </div>
    </button>
  )
}

// ─── YesterdayCard ──────────────────────────────────────────
const YesterdayCard = ({
  onNavigate,
}: {
  onNavigate: (tab: TabId, date?: string) => void
}) => {
  const [todoDefinitions] = useTodoDefinitions()
  const MORNING_TOTAL = byTiming(todoDefinitions, 'morning').length
  const EVENING_TOTAL = byTiming(todoDefinitions, 'evening').length
  const yk = yesterdayKey()
  const morningChecked = readYesterdayChecked('morning')
  const eveningChecked = readYesterdayChecked('evening')

  if (morningChecked.length === 0 && eveningChecked.length === 0) return null

  const [m, d] = yk.split('-').slice(1).map(Number)
  const date = new Date(parseInt(yk.split('-')[0]), m - 1, d)
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  const dateLabel = `${m}/${d}（${weekdays[date.getDay()]}）`

  const morningRate = MORNING_TOTAL > 0 ? Math.round((morningChecked.length / MORNING_TOTAL) * 100) : 0
  const eveningRate = EVENING_TOTAL > 0 ? Math.round((eveningChecked.length / EVENING_TOTAL) * 100) : 0
  const getRateColor = (rate: number) =>
    rate >= 80 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <button
      type="button"
      onClick={() => onNavigate('morning', yk)}
      className="w-full rounded-[28px] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(12,18,29,0.97),rgba(9,14,22,0.93))] px-5 py-5 text-left"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/35">
        Previous — {dateLabel}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/28">Morning</p>
          <p className="mt-1 text-xl font-semibold font-mono" style={{ color: getRateColor(morningRate) }}>
            {morningRate}%
          </p>
          <p className="text-[11px] text-white/28">{morningChecked.length}/{MORNING_TOTAL}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/28">Evening</p>
          <p className="mt-1 text-xl font-semibold font-mono" style={{ color: getRateColor(eveningRate) }}>
            {eveningRate}%
          </p>
          <p className="text-[11px] text-white/28">{eveningChecked.length}/{EVENING_TOTAL}</p>
        </div>
      </div>
    </button>
  )
}

// ─── DoneBanner ─────────────────────────────────────────────
const DoneBanner = ({
  type,
  onDismiss,
}: {
  type: 'morning' | 'evening'
  onDismiss: () => void
}) => {
  const color = type === 'morning' ? '#22c55e' : '#a78bfa'
  const label = type === 'morning' ? 'Morning complete' : 'Evening complete'
  const sub = type === 'morning' ? '朝のシーケンスが完了しました。' : '夜の振り返りが完了しました。'

  return (
    <div
      className="rounded-[28px] border px-5 py-4"
      style={{ borderColor: `${color}30`, backgroundColor: `${color}0a` }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color }}>{label}</p>
          <p className="mt-1 text-sm text-white/72">{sub}</p>
        </div>
        <button type="button" onClick={onDismiss} className="text-white/28 hover:text-white/55 text-lg leading-none">×</button>
      </div>
    </div>
  )
}

// ─── HomePage ────────────────────────────────────────────────
export const HomePage = ({
  onNavigate,
  morningDoneBanner = false,
  eveningDoneBanner = false,
  onClearMorningBanner,
  onClearEveningBanner,
}: {
  onNavigate: (tab: TabId, date?: string) => void
  morningDoneBanner?: boolean
  eveningDoneBanner?: boolean
  onClearMorningBanner?: () => void
  onClearEveningBanner?: () => void
}) => {
  const ctx = useTimeContext()
  const { boss } = useBossStorage()
  const [todoDefinitions] = useTodoDefinitions()
  const morningItems = byTiming(todoDefinitions, 'morning')
  const [checkedArr] = useTodayStorage<string[]>('morning:checked', [])
  const [eveningCheckedArr] = useTodayStorage<string[]>('evening:checked', [])
  const bossValue = boss?.value ?? null
  const bossCompleted = boss?.completed ?? false

  const visibleMorningIds = new Set(morningItems.map(i => i.id))
  const todayDone = checkedArr.filter(id => visibleMorningIds.has(id)).length
  const todayTotal = morningItems.length

  const morningDone = todayTotal > 0 && todayDone >= todayTotal
  const eveningDone = eveningCheckedArr.length > 0

  const morningPct = todayTotal > 0 ? Math.round((todayDone / todayTotal) * 100) : 0
  const coachLines = (() => {
    if (todayTotal === 0) {
      return [
        '今日もゼロから始めよう。最初の一歩を踏み出して。',
        '習慣を設定すると、ここに進捗が表示されます。',
      ]
    }
    if (morningPct === 0) {
      return [
        '今日もゼロから始めよう。最初の一歩を踏み出して。',
        `${todayTotal} 件の朝タスクが待っています。`,
      ]
    }
    if (morningPct < 50) {
      return [
        'いい調子！引き続き積み上げていこう。',
        `残り ${todayTotal - todayDone} 件。一つずつ着実に。`,
      ]
    }
    if (morningPct < 80) {
      return [
        '折り返しを超えた。このまま駆け抜けよう！',
        morningDone ? '朝のシーケンスが完了しています。' : `あと ${todayTotal - todayDone} 件で完了です。`,
      ]
    }
    return [
      '素晴らしい完成度！今日も全力で走り切った。',
      morningDone && eveningDone
        ? '朝・夜のルーティンを制覇しました。'
        : eveningDone ? '朝のシーケンスが完了しています。' : '夕方の振り返りで今日を閉じましょう。',
    ]
  })()

  return (
    <div className="space-y-3 px-4 py-4 pb-8">

      {/* 完了バナー */}
      {morningDoneBanner && (
        <DoneBanner type="morning" onDismiss={onClearMorningBanner ?? (() => {})} />
      )}
      {eveningDoneBanner && (
        <DoneBanner type="evening" onDismiss={onClearEveningBanner ?? (() => {})} />
      )}

      {/* ① Hero: 今日の焦点 + 進捗 */}
      <FocusCard
        boss={bossValue}
        bossCompleted={bossCompleted}
        todayDone={todayDone}
        todayTotal={todayTotal}
        morningDone={morningDone}
        eveningDone={eveningDone}
        period={ctx.period}
        onNavigate={onNavigate}
      />

      {/* ② 2カラム: Coach + Monthly */}
      <div className="grid grid-cols-2 gap-3">
        <CoachInsightCard lines={coachLines} />
        <MonthlyMiniCard onNavigate={onNavigate} />
      </div>

      {/* ③ 昨日の実績（データがあれば） */}
      <YesterdayCard onNavigate={onNavigate} />

      {/* ④ ナビリンク */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onNavigate('monthly')}
          className="rounded-2xl border border-white/[0.07] bg-[#111827]/60 px-4 py-4 text-left transition-colors hover:border-[#7dd3fc]/18 hover:bg-[#0f1a2a]"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8ed8ff]/70">Reports</p>
          <p className="mt-2 text-sm font-semibold text-white/80">月次レビュー</p>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('wanna-be')}
          className="rounded-2xl border border-white/[0.07] bg-[#111827]/60 px-4 py-4 text-left transition-colors hover:border-[#f59e0b]/18 hover:bg-[#0f1a2a]"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#f5c46b]/70">Identity</p>
          <p className="mt-2 text-sm font-semibold text-white/80">Wanna Be</p>
        </button>
      </div>
    </div>
  )
}
