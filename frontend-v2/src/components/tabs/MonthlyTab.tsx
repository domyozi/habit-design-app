import { useMemo, useState } from 'react'
import {
  countByMonth,
  countByWeek,
  countChecksForDates,
  countMonthlyChecks,
  getAllTimeBests,
  lastMonthKeys,
  thisMonthKeys,
  useDailyStorage,
  useMonthlyTargets,
  useLocalStorage,
  readDailyField,
} from '@/lib/storage'
import { streamClaude, buildWannaBeAnalysisPrompt } from '@/lib/ai'
import { ProgressRing } from '@/components/home/ProgressRing'
import { useTodoDefinitions, byTiming } from '@/lib/todos'

interface HabitDef {
  id: string
  label: string
  defaultTarget: number
  color: string
}

type Granularity = 'weekly' | 'monthly' | 'yearly'

const HABIT_COLORS = ['#f59e0b', '#ff6b35', '#22c55e', '#38bdf8', '#c4b5fd', '#f472b6', '#34d399', '#fb923c']

const today = new Date()
const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
const daysPassed = today.getDate()
const daysLeft = daysInMonth - daysPassed
const currentYear = today.getFullYear()

const predictWins = (actual: number, target: number) => {
  if (daysPassed === 0) return 0
  const pace = actual / daysPassed
  return Math.min(target, Math.round(actual + pace * daysLeft))
}

const sumCounts = (counts: Record<string, number>) =>
  Object.values(counts).reduce((sum, value) => sum + value, 0)

const recentDateKeys = (count: number, offset = 0) => {
  const end = new Date()
  end.setDate(end.getDate() - offset)
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end)
    date.setDate(end.getDate() - (count - 1 - index))
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  })
}

const getMonthTotal = (monthData: Record<string, Record<string, number>>, monthKey: string) =>
  sumCounts(monthData[monthKey] ?? {})

const ComparisonBar = ({
  label,
  color,
  this: thisVal,
  last,
  best,
  target,
}: {
  label: string
  color: string
  this: number
  last: number
  best: number
  target: number
}) => {
  const max = Math.max(target, best, thisVal, 1)
  const bar = (v: number, opacity: string) => (
    <div className="h-2 rounded-full" style={{ width: `${Math.round((v / max) * 100)}%`, background: color, opacity }} />
  )

  return (
    <div className="space-y-1">
      <div className="mb-0.5 flex items-center justify-between">
        <span className="text-xs text-white/70">{label}</span>
        <span className="text-[11px] font-mono" style={{ color }}>
          {thisVal} <span className="text-white/30">/ Last {last} / Best {best}</span>
        </span>
      </div>
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="w-8 text-[9px] text-white/30">This</span>
          <div className="flex-1 rounded-full bg-white/[0.04]">{bar(thisVal, '1')}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-8 text-[9px] text-white/30">Last</span>
          <div className="flex-1 rounded-full bg-white/[0.04]">{bar(last, '0.5')}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-8 text-[9px] text-white/30">Best</span>
          <div className="flex-1 rounded-full bg-white/[0.04]">{bar(best, '0.3')}</div>
        </div>
      </div>
    </div>
  )
}

const WeeklyChart = ({
  weekData,
  color,
  habitId,
}: {
  weekData: Record<string, Record<string, number>>
  color: string
  habitId: string
}) => {
  const weeks = ['W1', 'W2', 'W3', 'W4']
  const values = weeks.map(w => weekData[w]?.[habitId] ?? 0)
  const maxVal = Math.max(...values, 1)

  return (
    <div className="flex h-8 items-end gap-1">
      {weeks.map((w, i) => (
        <div key={w} className="flex flex-1 flex-col items-center gap-0.5">
          <div
            className="w-full rounded-sm transition-all"
            style={{
              height: `${Math.round((values[i] / maxVal) * 28)}px`,
              minHeight: '2px',
              background: color,
              opacity: values[i] > 0 ? '0.8' : '0.15',
            }}
          />
          <span className="text-[8px] text-[#444]">{w}</span>
        </div>
      ))}
    </div>
  )
}

const YearlyChart = ({
  monthData,
  color,
  habitId,
}: {
  monthData: Record<string, Record<string, number>>
  color: string
  habitId: string
}) => {
  const months = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))
  const values = months.map(monthKey => monthData[monthKey]?.[habitId] ?? 0)
  const maxVal = Math.max(...values, 1)
  const labels = ['1', '', '3', '', '5', '', '7', '', '9', '', '11', '12']

  return (
    <div className="grid grid-cols-12 items-end gap-1">
      {months.map((monthKey, index) => (
        <div key={monthKey} className="flex flex-col items-center gap-1">
          <div
            className="w-full rounded-sm transition-all"
            style={{
              height: `${Math.max(6, Math.round((values[index] / maxVal) * 56))}px`,
              background: color,
              opacity: values[index] > 0 ? '0.82' : '0.12',
            }}
          />
          <span className="text-[8px] text-[#444]">{labels[index]}</span>
        </div>
      ))}
    </div>
  )
}

const Heatmap = ({ checksByDay, habitDefs }: { checksByDay: Record<string, Set<string>>; habitDefs: HabitDef[] }) => {
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const month = today.getMonth() + 1
  const year = today.getFullYear()

  if (habitDefs.length === 0) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr>
            <td className="w-10 py-1 pr-2 text-[#555]" />
            {days.map(d => (
              <td key={d} className={['px-0.5 py-1 text-center', d === daysPassed ? 'font-bold text-[#f59e0b]' : 'text-[#444]'].join(' ')}>
                {d}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {habitDefs.map(habit => (
            <tr key={habit.id}>
              <td className="whitespace-nowrap py-1 pr-2 text-[#666]">{habit.label.slice(0, 4)}</td>
              {days.map(d => {
                const isFuture = d > daysPassed
                const isToday = d === daysPassed
                const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                const checked = checksByDay[dateKey]?.has(habit.id) ?? false
                return (
                  <td key={d} className="px-0.5 py-1 text-center">
                    <span
                      className={[
                        'inline-block h-3 w-3 rounded-sm',
                        isToday ? 'ring-1 ring-[#f59e0b]' : '',
                        isFuture ? 'bg-[#1c1c1c]' : checked ? 'bg-[#22c55e]' : 'bg-[#2a0000]',
                      ].join(' ')}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const WeightTrendChart = () => {
  const data = useMemo(() => readDailyField('evening', 'weight', 30), [])
  const points = useMemo(() =>
    data
      .map((d, i) => ({ index: i, date: d.date, kg: d.value ? parseFloat(d.value) : null }))
      .filter((d): d is { index: number; date: string; kg: number } => d.kg !== null && !isNaN(d.kg)),
    [data]
  )

  if (points.length < 2) return null

  const minKg = Math.min(...points.map(p => p.kg))
  const maxKg = Math.max(...points.map(p => p.kg))
  const range = maxKg - minKg || 1
  const W = 300, H = 64, PAD = 6

  const x = (idx: number) => PAD + (idx / 29) * (W - PAD * 2)
  const y = (kg: number) => H - PAD - ((kg - minKg) / range) * (H - PAD * 2)

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.index)} ${y(p.kg)}`).join(' ')

  const latest = points[points.length - 1]
  const recent7 = points.filter(p => p.index >= 23)
  const avg7 = recent7.length > 0 ? recent7.reduce((s, p) => s + p.kg, 0) / recent7.length : null
  const trend = points.length >= 2
    ? points[points.length - 1].kg - points[0].kg
    : 0

  return (
    <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/75 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/35">Weight trend</span>
        <span className="text-[11px] text-white/28">past 30 days</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 80 }}>
        <path d={pathD} fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map(p => (
          <circle key={p.index} cx={x(p.index)} cy={y(p.kg)} r="2" fill="#38bdf8" />
        ))}
      </svg>
      <div className="mt-2 flex items-center gap-4">
        <div>
          <p className="text-[10px] text-white/30">最新</p>
          <p className="text-sm font-bold text-[#38bdf8]">{latest.kg.toFixed(1)} kg</p>
        </div>
        {avg7 !== null && (
          <div>
            <p className="text-[10px] text-white/30">7日平均</p>
            <p className="text-sm font-semibold text-white/70">{avg7.toFixed(1)} kg</p>
          </div>
        )}
        <div>
          <p className="text-[10px] text-white/30">トレンド</p>
          <p className={['text-sm font-semibold', trend < 0 ? 'text-[#22c55e]' : trend > 0 ? 'text-[#f87171]' : 'text-white/50'].join(' ')}>
            {trend > 0 ? '+' : ''}{trend.toFixed(1)} kg
          </p>
        </div>
        <div>
          <p className="text-[10px] text-white/30">範囲</p>
          <p className="text-sm font-semibold text-white/50">{minKg.toFixed(1)}–{maxKg.toFixed(1)}</p>
        </div>
      </div>
    </div>
  )
}

const RatingTrendChart = () => {
  const data = useMemo(() => readDailyField('evening', 'stars', 30), [])
  const points = useMemo(() =>
    data.map((d, i) => ({ index: i, date: d.date, stars: d.value ? parseInt(d.value) : null })),
    [data]
  )
  const hasData = points.some(p => p.stars !== null && p.stars > 0)
  if (!hasData) return null

  const validPoints = points.filter((p): p is { index: number; date: string; stars: number } => p.stars !== null && p.stars > 0)
  const avg = validPoints.reduce((s, p) => s + p.stars, 0) / validPoints.length

  const starColor = (n: number) => {
    if (n <= 1) return '#f87171'
    if (n <= 2) return '#fb923c'
    if (n <= 3) return '#facc15'
    if (n <= 4) return '#a3e635'
    return '#22c55e'
  }

  return (
    <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/75 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/35">Daily quality ★</span>
        <span className="text-[11px] text-white/50">月平均 {avg.toFixed(1)} ★</span>
      </div>
      <div className="flex h-12 items-end gap-[2px]">
        {points.map(p => (
          <div key={p.index} className="flex flex-1 flex-col items-center justify-end">
            {p.stars ? (
              <div
                className="w-full rounded-sm"
                style={{
                  height: `${(p.stars / 5) * 44}px`,
                  minHeight: 4,
                  background: starColor(p.stars),
                  opacity: 0.85,
                }}
              />
            ) : (
              <div className="w-full rounded-sm bg-white/[0.04]" style={{ height: 4 }} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-white/20">
        <span>30日前</span>
        <span>今日</span>
      </div>
    </div>
  )
}

const TargetsForm = ({
  habitDefs,
  targets,
  onChange,
  onClose,
}: {
  habitDefs: HabitDef[]
  targets: Record<string, number>
  onChange: (id: string, value: number) => void
  onClose: () => void
}) => (
  <div className="space-y-3 rounded-[24px] border border-white/[0.06] bg-[#111827]/78 p-4">
    <div className="mb-1 flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8da4c3]">Target tuning</span>
      <button type="button" onClick={onClose} className="text-xs uppercase tracking-[0.12em] text-white/35 hover:text-white">
        Close
      </button>
    </div>
    {habitDefs.map(habit => (
      <div key={habit.id} className="flex items-center justify-between">
        <span className="text-sm" style={{ color: habit.color }}>{habit.label}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange(habit.id, Math.max(1, (targets[habit.id] ?? habit.defaultTarget) - 1))}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-sm text-white/60 hover:text-white"
          >
            −
          </button>
          <span className="w-8 text-center text-sm font-mono text-white">{targets[habit.id] ?? habit.defaultTarget}</span>
          <button
            type="button"
            onClick={() => onChange(habit.id, (targets[habit.id] ?? habit.defaultTarget) + 1)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-sm text-white/60 hover:text-white"
          >
            ＋
          </button>
          <span className="text-[11px] text-white/24">回</span>
        </div>
      </div>
    ))}
  </div>
)

interface WannaBeGoal {
  id: string
  emoji: string
  title: string
}

const WannaBeAnalysis = ({
  monthlyCounts,
  targets,
  habitDefs,
}: {
  monthlyCounts: Record<string, number>
  targets: Record<string, number>
  habitDefs: Array<{ id: string; label: string }>
}) => {
  const [goals] = useLocalStorage<WannaBeGoal[]>('wannabe:goals', [])
  const [streamText, setStreamText] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const activeGoals = goals.filter(goal => !('priority' in goal && (goal as { priority: string }).priority === 'done'))

  const handleAnalyze = async () => {
    if (loading) return
    setStreamText('')
    setDone(false)
    setLoading(true)

    const prompt = buildWannaBeAnalysisPrompt({
      wannaBe: activeGoals.map(g => ({ title: g.title, emoji: g.emoji })),
      monthlyCounts,
      targets,
      habitDefs,
    })

    try {
      await streamClaude(
        [{ role: 'user', content: prompt }],
        'あなたは習慣設計のコーチです。ユーザーのWanna Beと習慣の繋がりを分析してください。',
        chunk => setStreamText(prev => prev + chunk),
        () => setDone(true),
        1024,
      )
    } catch {
      setStreamText('分析に失敗しました。ログイン状態またはサーバー側のAI設定を確認してください。')
      setDone(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      {activeGoals.length === 0 ? (
        <p className="text-xs text-white/28">設定画面でゴールを登録すると分析できます。</p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap gap-1">
            {activeGoals.slice(0, 4).map(goal => (
              <span key={goal.id} className="rounded-full border border-white/[0.06] bg-[#0b1320] px-2 py-0.5 text-[11px] text-white/50">
                {goal.title.slice(0, 12)}{goal.title.length > 12 ? '…' : ''}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={loading}
            className="w-full rounded-full border border-[#c4b5fd]/30 bg-[#c4b5fd]/12 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#ddd6fe] disabled:opacity-40"
          >
            {loading ? 'Analyzing' : 'Run AI analysis'}
          </button>
        </>
      )}

      {(streamText || loading) && (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0b1320] p-3">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-white/70">
            {streamText}
            {!done && loading && <span className="animate-pulse">▊</span>}
          </p>
        </div>
      )}
    </div>
  )
}

const ReportSection = () => {
  const [morningReport] = useDailyStorage<string>('morning', 'report', '')
  const [morningReportAt] = useDailyStorage<string>('morning', 'reportAt', '')
  const [eveningReport] = useDailyStorage<string>('evening', 'report', '')
  const [eveningReportAt] = useDailyStorage<string>('evening', 'reportAt', '')
  const [slot, setSlot] = useState<'morning' | 'evening'>('morning')
  const [copied, setCopied] = useState(false)

  const report = slot === 'morning' ? morningReport : eveningReport
  const reportAt = slot === 'morning' ? morningReportAt : eveningReportAt

  const handleCopy = async () => {
    if (!report) return
    await navigator.clipboard.writeText(report)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(['morning', 'evening'] as const).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setSlot(s)}
            className={[
              'flex-1 rounded-full border py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors',
              slot === s
                ? 'border-[#7dd3fc]/30 bg-[#7dd3fc]/12 text-[#aee5ff]'
                : 'border-white/10 text-white/35 hover:text-white',
            ].join(' ')}
          >
            {s === 'morning' ? 'Morning report' : 'Evening report'}
          </button>
        ))}
      </div>

      <div className="min-h-[120px] rounded-[24px] border border-white/[0.08] bg-[#0b1320] p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">AI report text</p>
          {reportAt && <span className="text-[10px] text-white/24">Generated {reportAt}</span>}
        </div>
        {report ? (
          <pre className="whitespace-pre-wrap text-xs leading-relaxed text-[#ccc]">{report}</pre>
        ) : (
          <p className="text-xs italic text-white/28">
            {slot === 'morning' ? 'Morning' : 'Evening'} タブで report を生成するとここに保存されます。
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={handleCopy}
        disabled={!report}
        className={[
          'w-full rounded-full py-2.5 text-sm font-semibold uppercase tracking-[0.12em] transition-colors',
          report ? 'bg-[#7dd3fc] text-black' : 'cursor-not-allowed bg-[#1c1c1c] text-[#444]',
        ].join(' ')}
      >
        {copied ? 'Copied' : 'Copy report'}
      </button>
    </div>
  )
}

const GranularityTabs = ({
  active,
  onChange,
}: {
  active: Granularity
  onChange: (value: Granularity) => void
}) => (
  <div className="grid grid-cols-3 gap-2 rounded-[24px] border border-white/[0.06] bg-[#0b1320]/84 p-2">
    {([
      { id: 'weekly', label: '週次', note: 'rolling 7d' },
      { id: 'monthly', label: '月次', note: 'current month' },
      { id: 'yearly', label: '年次', note: 'annual signal' },
    ] as const).map(item => (
      <button
        key={item.id}
        type="button"
        onClick={() => onChange(item.id)}
        className={[
          'rounded-2xl px-3 py-2 text-left transition-colors',
          active === item.id ? 'border border-white/[0.08] bg-white/[0.06]' : 'border border-transparent bg-transparent hover:bg-white/[0.03]',
        ].join(' ')}
      >
        <p className="text-sm font-semibold text-white/88">{item.label}</p>
        <p className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-white/35">{item.note}</p>
      </button>
    ))}
  </div>
)

const WeeklyView = ({
  habits,
  weekData,
  currentWeekCounts,
  previousWeekCounts,
}: {
  habits: Array<HabitDef & { actual: number; last: number; best: number; target: number }>
  weekData: Record<string, Record<string, number>>
  currentWeekCounts: Record<string, number>
  previousWeekCounts: Record<string, number>
}) => {
  const currentWeekTotal = sumCounts(currentWeekCounts)
  const previousWeekTotal = sumCounts(previousWeekCounts)
  const lead = habits[0]
  const lag = [...habits].sort((a, b) => (a.actual / Math.max(a.target, 1)) - (b.actual / Math.max(b.target, 1)))[0]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/72 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">今週 <span className="text-white/20">/ THIS WEEK</span></p>
          <p className="mt-2 text-2xl font-semibold text-white">{currentWeekTotal}</p>
          <p className="mt-1 text-xs text-white/35">完了タスク数</p>
        </div>
        <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/72 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">先週 <span className="text-white/20">/ LAST WEEK</span></p>
          <p className="mt-2 text-2xl font-semibold text-white">{previousWeekTotal}</p>
          <p className="mt-1 text-xs text-white/35">{currentWeekTotal - previousWeekTotal >= 0 ? '+' : ''}{currentWeekTotal - previousWeekTotal} 前週比</p>
        </div>
        <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/72 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">牽引習慣 <span className="text-white/20">/ LEADING</span></p>
          <p className="mt-2 text-lg font-semibold text-white">{lead?.label ?? '—'}</p>
          <p className="mt-1 text-xs text-white/35">{lead ? `${lead.actual}/${lead.target}` : 'データなし'}</p>
        </div>
        <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/72 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">要注意 <span className="text-white/20">/ AT RISK</span></p>
          <p className="mt-2 text-lg font-semibold text-white">{lag?.label ?? '—'}</p>
          <p className="mt-1 text-xs text-white/35">{lag ? `${lag.actual}/${lag.target}` : 'データなし'}</p>
        </div>
      </div>

      <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/75 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/35">4週間の分布</p>
        <div className="space-y-4">
          {habits.map(habit => (
            <div key={habit.id}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs" style={{ color: habit.color }}>{habit.label}</span>
                <span className="text-[10px] text-white/24">{habit.actual}/{habit.target} this month</span>
              </div>
              <WeeklyChart weekData={weekData} color={habit.color} habitId={habit.id} />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/75 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/35">Weekly comparison</p>
        <div className="space-y-4">
          {habits.map(habit => (
            <ComparisonBar
              key={habit.id}
              label={habit.label}
              color={habit.color}
              this={currentWeekCounts[habit.id] ?? 0}
              last={previousWeekCounts[habit.id] ?? 0}
              best={habit.best}
              target={habit.target}
            />
          ))}
        </div>
      </div>

      <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/75 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/35">Month context</p>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {habits.map(habit => {
            const remaining = habit.target - habit.actual
            return (
              <div key={habit.id} className="rounded-2xl border border-white/[0.06] bg-[#0b1320] p-3">
                <p className="mb-1 text-[11px] text-white/32">{habit.label}</p>
                <p className="text-base font-bold" style={{ color: habit.color }}>{remaining > 0 ? `${remaining} remaining` : 'target reached'}</p>
                <p className="text-[10px] text-white/26">{habit.actual}/{habit.target} this month</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const MonthlyView = ({
  habits,
  habitDefs,
  targets,
  showTargetsForm,
  setShowTargetsForm,
  handleTargetChange,
  monthlyCounts,
  lastMonthCounts,
  checksByDay,
  showReport,
  setShowReport,
}: {
  habits: Array<HabitDef & { actual: number; last: number; best: number; target: number }>
  habitDefs: HabitDef[]
  targets: Record<string, number>
  showTargetsForm: boolean
  setShowTargetsForm: (value: boolean | ((prev: boolean) => boolean)) => void
  handleTargetChange: (id: string, value: number) => void
  monthlyCounts: Record<string, number>
  lastMonthCounts: Record<string, number>
  checksByDay: Record<string, Set<string>>
  showReport: boolean
  setShowReport: (value: boolean | ((prev: boolean) => boolean)) => void
}) => (
  <div className="space-y-4">
    <div className="rounded-[28px] border border-[#9fb4d1]/10 bg-[linear-gradient(180deg,rgba(9,16,27,0.98),rgba(7,12,21,0.96))] px-4 py-5 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8da4c3]">習慣分析 <span className="text-[#8da4c3]/40">/ ANALYSIS</span></p>
          <p className="mt-2 text-lg font-semibold text-white">{today.getMonth() + 1}月の進捗と着地予測を確認します。</p>
          <p className="mt-1 text-sm text-white/48">習慣の強度、比較、AI分析、保存済みレポートを一画面で扱います。</p>
        </div>
        <button
          type="button"
          onClick={() => setShowTargetsForm(v => !v)}
          className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-white/42 hover:text-white"
        >
          {showTargetsForm ? 'Close' : 'Targets'}
        </button>
      </div>
    </div>

    <div className="rounded-[24px] border border-white/[0.08] bg-[#0b1320]/85 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/35">今月の概要</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-white/25">Live</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {habits.map(habit => (
          <ProgressRing
            key={habit.id}
            label={habit.label}
            color={habit.color}
            target={habit.target}
            actual={habit.actual}
            best={habit.best || undefined}
            size={72}
          />
        ))}
      </div>
    </div>

    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/72 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">今月の合計</p>
        <p className="mt-2 text-2xl font-semibold text-white">{sumCounts(monthlyCounts)}</p>
        <p className="mt-1 text-xs text-white/35">完了回数</p>
      </div>
      <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/72 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">先月の合計</p>
        <p className="mt-2 text-2xl font-semibold text-white">{sumCounts(lastMonthCounts)}</p>
        <p className="mt-1 text-xs text-white/35">比較基準</p>
      </div>
      <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/72 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">自己最高</p>
        <p className="mt-2 text-lg font-semibold text-white">
          {habits.slice().sort((a, b) => (b.best ?? 0) - (a.best ?? 0))[0]?.label ?? '—'}
        </p>
        <p className="mt-1 text-xs text-white/35">
          {habits.slice().sort((a, b) => (b.best ?? 0) - (a.best ?? 0))[0]
            ? `${habits.slice().sort((a, b) => (b.best ?? 0) - (a.best ?? 0))[0].best} 日の最高`
            : '記録なし'}
        </p>
      </div>
      <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/72 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">習慣数</p>
        <p className="mt-2 text-2xl font-semibold text-white">{habits.length}</p>
        <p className="mt-1 text-xs text-white/35">追跡中</p>
      </div>
    </div>

    {showTargetsForm && (
      <TargetsForm
        habitDefs={habitDefs}
        targets={targets}
        onChange={handleTargetChange}
        onClose={() => setShowTargetsForm(false)}
      />
    )}

    <WeightTrendChart />
    <RatingTrendChart />

    <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/75 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/35">習慣の比較</p>
      <div className="space-y-4">
        {habits.map(habit => (
          <ComparisonBar
            key={habit.id}
            label={habit.label}
            color={habit.color}
            this={habit.actual}
            last={habit.last}
            best={habit.best}
            target={habit.target}
          />
        ))}
      </div>
    </div>

    <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/75 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/35">月末予測</span>
        <span className="text-[11px] text-white/28">残り {daysLeft} 日</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {habits.map(habit => {
          const predicted = predictWins(habit.actual, habit.target)
          const remaining = habit.target - habit.actual
          return (
            <div key={habit.id} className="rounded-2xl border border-white/[0.06] bg-[#111827]/72 p-3">
              <p className="mb-1 text-[11px] text-white/32">{habit.label}</p>
              <p className="text-base font-bold" style={{ color: habit.color }}>{predicted} 件予測</p>
              <p className="text-[10px] text-white/26">{remaining > 0 ? `あと ${remaining} 件` : '目標達成'}</p>
            </div>
          )
        })}
      </div>
    </div>

    {habitDefs.length > 0 && (
      <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/75 p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/35">完了マップ</p>
          <span className="text-[10px] text-white/24">緑=完了 / 赤=未完</span>
        </div>
        <Heatmap checksByDay={checksByDay} habitDefs={habitDefs} />
      </div>
    )}

    <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/75 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#ddd6fe]">理想像との連動</p>
      </div>
      <WannaBeAnalysis monthlyCounts={monthlyCounts} targets={targets} habitDefs={habitDefs} />
    </div>

    <div>
      <button
        type="button"
        onClick={() => setShowReport(v => !v)}
        className="mb-2 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-[0.12em] text-white/35"
      >
        <span>保存済みレポート</span>
        <span className="text-white/26">{showReport ? '閉じる' : '開く'}</span>
      </button>
      {showReport && <ReportSection />}
    </div>

  </div>
)

const YearlyView = ({
  habits,
  monthData,
}: {
  habits: Array<HabitDef & { actual: number; last: number; best: number; target: number }>
  monthData: Record<string, Record<string, number>>
}) => {
  const monthKeys = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))
  const monthTotals = monthKeys.map(monthKey => ({
    key: monthKey,
    total: getMonthTotal(monthData, monthKey),
  }))
  const bestMonth = [...monthTotals].sort((a, b) => b.total - a.total)[0]
  const activeMonths = monthTotals.filter(item => item.total > 0).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/72 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">活動月</p>
          <p className="mt-2 text-2xl font-semibold text-white">{activeMonths}</p>
          <p className="mt-1 text-xs text-white/35">記録のある月</p>
        </div>
        <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/72 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">最高月</p>
          <p className="mt-2 text-2xl font-semibold text-white">{bestMonth ? `${bestMonth.key}月` : '—'}</p>
          <p className="mt-1 text-xs text-white/35">{bestMonth ? `${bestMonth.total} 完了` : '記録なし'}</p>
        </div>
        <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/72 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">習慣数</p>
          <p className="mt-2 text-2xl font-semibold text-white">{habits.length}</p>
          <p className="mt-1 text-xs text-white/35">追跡中</p>
        </div>
        <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/72 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">期間</p>
          <p className="mt-2 text-2xl font-semibold text-white">12m</p>
          <p className="mt-1 text-xs text-white/35">月次構造</p>
        </div>
      </div>

      <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/75 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/35">年間の習慣推移</p>
        <div className="space-y-4">
          {habits.map(habit => (
            <div key={habit.id}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs" style={{ color: habit.color }}>{habit.label}</span>
                <span className="text-[10px] text-white/24">{habit.actual}/{habit.target} this month</span>
              </div>
              <YearlyChart monthData={monthData} color={habit.color} habitId={habit.id} />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[24px] border border-white/[0.06] bg-[#111827]/75 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/35">月別合計</p>
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-6 xl:grid-cols-12">
          {monthTotals.map(month => (
            <div key={month.key} className="rounded-2xl border border-white/[0.06] bg-[#0b1320] p-3">
              <p className="text-[10px] text-white/28">{month.key}月</p>
              <p className="mt-1 text-base font-semibold text-white">{month.total}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export const MonthlyTab = () => {
  const [granularity, setGranularity] = useState<Granularity>('monthly')
  const [showTargetsForm, setShowTargetsForm] = useState(false)
  const [showReport, setShowReport] = useState(false)

  const [todoDefinitions] = useTodoDefinitions()
  const habitDefs: HabitDef[] = useMemo(() =>
    byTiming(todoDefinitions, 'morning').filter(t => t.isMust).map((t, i) => ({
      id: t.id,
      label: t.label,
      defaultTarget: 20,
      color: HABIT_COLORS[i % HABIT_COLORS.length],
    })),
    [todoDefinitions]
  )
  const defaultTargets = useMemo(
    () => Object.fromEntries(habitDefs.map(h => [h.id, h.defaultTarget])),
    [habitDefs]
  )

  const [targets, setTargets] = useMonthlyTargets(defaultTargets)

  const monthlyCounts = useMemo(() => countMonthlyChecks('morning:checked'), [])
  const lastMonthCounts = useMemo(() => countChecksForDates('morning', 'checked', lastMonthKeys()), [])
  const allTimeBests = useMemo(() => getAllTimeBests(), [])
  const weekData = useMemo(() => countByWeek('morning', 'checked'), [])
  const monthData = useMemo(() => countByMonth('morning', 'checked', currentYear), [])
  const currentWeekCounts = useMemo(() => countChecksForDates('morning', 'checked', recentDateKeys(7, 0)), [])
  const previousWeekCounts = useMemo(() => countChecksForDates('morning', 'checked', recentDateKeys(7, 7)), [])

  const checksByDay = useMemo(() => {
    const result: Record<string, Set<string>> = {}
    for (const dateKey of thisMonthKeys()) {
      const newKey = `daily:${dateKey}:morning:checked`
      const oldKey = `morning:checked:${dateKey}`
      try {
        const raw = localStorage.getItem(newKey) ?? localStorage.getItem(oldKey)
        result[dateKey] = new Set(raw ? JSON.parse(raw) : [])
      } catch {
        result[dateKey] = new Set()
      }
    }
    return result
  }, [])

  const habits = habitDefs.map(habit => ({
    ...habit,
    actual: monthlyCounts[habit.id] ?? 0,
    last: lastMonthCounts[habit.id] ?? 0,
    best: allTimeBests[habit.id] ?? 0,
    target: (targets[habit.id] !== undefined && targets[habit.id] > 0)
      ? targets[habit.id]
      : habit.defaultTarget,
  }))

  const handleTargetChange = (id: string, value: number) => {
    setTargets(prev => ({ ...prev, [id]: value }))
  }

  return (
    <div className="space-y-4 px-4 pb-6 pt-4">
      <div className="flex items-center justify-between gap-3 rounded-[28px] border border-[#9fb4d1]/10 bg-[linear-gradient(180deg,rgba(9,16,27,0.98),rgba(7,12,21,0.96))] px-4 py-4 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8da4c3]">BI workspace</p>
          <p className="mt-2 text-lg font-semibold text-white">週次・月次・年次で、実行の構造を同じ指標で見ます。</p>
          <p className="mt-1 text-sm text-white/48">比較、推移、分布、予測の4軸で習慣の変化を追います。</p>
        </div>
      </div>

      <GranularityTabs active={granularity} onChange={setGranularity} />

      {granularity === 'weekly' && (
        <WeeklyView
          habits={habits}
          weekData={weekData}
          currentWeekCounts={currentWeekCounts}
          previousWeekCounts={previousWeekCounts}
        />
      )}

      {granularity === 'monthly' && (
        <MonthlyView
          habits={habits}
          habitDefs={habitDefs}
          targets={targets}
          showTargetsForm={showTargetsForm}
          setShowTargetsForm={setShowTargetsForm}
          handleTargetChange={handleTargetChange}
          monthlyCounts={monthlyCounts}
          lastMonthCounts={lastMonthCounts}
          checksByDay={checksByDay}
          showReport={showReport}
          setShowReport={setShowReport}
        />
      )}

      {granularity === 'yearly' && <YearlyView habits={habits} monthData={monthData} />}
    </div>
  )
}
