import { useMemo, useRef, useState } from 'react'
import { useTimeContext } from '@/lib/timeContext'
import { useBossStorage, countMonthlyChecks, useLocalStorage, useTodayStorage, useMonthlyTargets, getAllTimeBests, yesterdayKey } from '@/lib/storage'
import { callClaude, buildMorningCommentPrompt, buildEveningCommentPrompt, generateMorningCheckinParse, type MorningCheckinParse } from '@/lib/ai'
import { ProgressRing } from '@/components/home/ProgressRing'
import { MorningCheckinDiffPanel } from '@/components/home/MorningCheckinDiffPanel'
import { byTiming, createTodoId, useTodoDefinitions } from '@/lib/todos'
import type { TabId } from '@/types'

interface GoalRecord {
  id: string
  title: string
  sub?: string
  priority?: 'critical' | 'high' | 'done'
}

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

interface SpeechRecognitionCtor {
  new (): SpeechRecognitionLike
}

const getSpeechRecognition = (): SpeechRecognitionCtor | null => {
  if (typeof window === 'undefined') return null
  const anyWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return anyWindow.SpeechRecognition ?? anyWindow.webkitSpeechRecognition ?? null
}

const fallbackMorningParse = (
  transcript: string,
  currentGap: string,
  currentIdentity: string,
  currentGoal: string
): MorningCheckinParse => {
  const lines = transcript
    .split(/\n|。/)
    .map(line => line.trim())
    .filter(Boolean)
  return {
    gap_summary: lines[0] ?? currentGap ?? '今朝の差分はまだ未整理です。',
    today_goal: lines[1] ?? currentGoal ?? '今日の最重要を1件に絞る',
    identity_anchor: lines[2] ?? currentIdentity ?? '理想像との接続を言語化する',
    task_candidates: lines.slice(3, 6).map(line => ({ label: line, reason: '朝のチェックインから抽出' })),
  }
}

// ─── 昨日データ読み取り ──────────────────────────────────────
const readYesterdayChecked = (slot: 'morning' | 'evening'): string[] => {
  const yk = yesterdayKey()
  const newKey = `daily:${yk}:${slot}:checked`
  const oldKey = `${slot}:checked:${yk}`
  const raw = localStorage.getItem(newKey) ?? localStorage.getItem(oldKey)
  if (!raw) return []
  try { return JSON.parse(raw) as string[] } catch { return [] }
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

  // 昨日のデータが何もなければ表示しない
  if (morningChecked.length === 0 && eveningChecked.length === 0) return null

  const [m, d] = yk.split('-').slice(1).map(Number)
  const date = new Date(parseInt(yk.split('-')[0]), m - 1, d)
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  const dateLabel = `${m}/${d}（${weekdays[date.getDay()]}）`

  const morningRate = Math.round((morningChecked.length / MORNING_TOTAL) * 100)
  const eveningRate = Math.round((eveningChecked.length / EVENING_TOTAL) * 100)

  const getRateColor = (rate: number) =>
    rate >= 80 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <button
      type="button"
      onClick={() => onNavigate('morning', yk)}
      className="w-full rounded-2xl border border-white/[0.08] bg-[#0f1726]/80 px-4 py-4 text-left"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">
          Previous day {dateLabel}
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-white/28">Open detail</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Morning</span>
          <span className="text-sm font-mono font-bold" style={{ color: getRateColor(morningRate) }}>
            {morningChecked.length}/{MORNING_TOTAL}
          </span>
          <span className="ml-2 text-[10px] text-white/30">{morningRate}%</span>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Evening</span>
          <span className="text-sm font-mono font-bold" style={{ color: getRateColor(eveningRate) }}>
            {eveningChecked.length}/{EVENING_TOTAL}
          </span>
          <span className="ml-2 text-[10px] text-white/30">{eveningRate}%</span>
        </div>
      </div>
    </button>
  )
}

// ─── 定数 ────────────────────────────────────────────────────
const HABIT_DEFS = [
  { id: 'early-rise', label: '早起き', color: '#f59e0b', defaultTarget: 14 },
  { id: 'training',   label: '筋トレ', color: '#ff6b35', defaultTarget: 24 },
  { id: 'english',    label: '英語',   color: '#22c55e', defaultTarget: 10 },
  { id: 'cardio',     label: '有酸素', color: '#38bdf8', defaultTarget: 15 },
]

const DEFAULT_TARGETS: Record<string, number> = Object.fromEntries(
  HABIT_DEFS.map(h => [h.id, h.defaultTarget])
)

// ─── ContextCard ────────────────────────────────────────────
const ContextCard = ({
  period,
  greeting,
  label,
  onNavigate,
  eveningDone,
  morningDone,
}: {
  period: 'morning' | 'evening' | 'other'
  greeting: string
  label: string
  onNavigate: (tab: TabId) => void
  eveningDone?: boolean
  morningDone?: boolean
}) => {
  if (period === 'morning') {
    if (morningDone) {
      return (
        <div className="flex w-full flex-col justify-start rounded-[28px] border border-[#34d399]/15 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.08),transparent_45%),linear-gradient(180deg,rgba(9,16,27,0.98),rgba(8,13,22,0.92))] px-4 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#34d399]/70">完了済み</p>
          <p className="mt-2 text-lg font-semibold text-white/70">朝のルーティン完了</p>
          <p className="mt-1 text-sm text-white/42">今日の朝シーケンスはすべて終わっています</p>
          <div className="mt-4 flex items-center gap-2">
            <span className="text-[#34d399] text-sm">✓</span>
            <span className="text-xs text-white/40">Morning sequence</span>
          </div>
        </div>
      )
    }
    return (
      <button
        type="button"
        onClick={() => onNavigate('morning')}
        className="flex w-full flex-col justify-start rounded-[28px] border border-[#7dd3fc]/20 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.18),transparent_45%),linear-gradient(180deg,rgba(9,16,27,0.98),rgba(8,13,22,0.92))] px-4 py-5 text-left shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8ed8ff]">Active window</p>
        <p className="mt-2 text-lg font-semibold text-white">{greeting}</p>
        <p className="mt-1 text-sm text-white/62">{label}</p>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8ed8ff]">Morning sequence</span>
          <span className="rounded-full border border-[#8ed8ff]/25 bg-[#8ed8ff]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#aee5ff]">Open</span>
        </div>
      </button>
    )
  }
  if (period === 'evening') {
    if (eveningDone) {
      return (
        <div className="flex w-full flex-col justify-start rounded-[28px] border border-[#34d399]/15 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.08),transparent_42%),linear-gradient(180deg,rgba(9,16,27,0.98),rgba(8,13,22,0.92))] px-4 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#34d399]/70">完了済み</p>
          <p className="mt-2 text-lg font-semibold text-white/70">夜の振り返り完了</p>
          <p className="mt-1 text-sm text-white/42">お疲れさまでした。今日の記録はすべて完了しています</p>
          <div className="mt-4 flex items-center gap-2">
            <span className="text-[#34d399] text-sm">✓</span>
            <span className="text-xs text-white/40">Evening review</span>
          </div>
        </div>
      )
    }
    // 22時以降は無理に促さず、ゆっくり休むよう促す
    const isLateNight = new Date().getHours() >= 22
    if (isLateNight) {
      return (
        <div className="flex w-full flex-col justify-start rounded-[28px] border border-[#c4b5fd]/10 bg-[radial-gradient(circle_at_top_left,rgba(196,181,253,0.06),transparent_42%),linear-gradient(180deg,rgba(9,16,27,0.98),rgba(8,13,22,0.92))] px-4 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#c4b5fd]/50">Wind down</p>
          <p className="mt-2 text-lg font-semibold text-white/80">ゆっくり休んでください</p>
          <p className="mt-1 text-sm text-white/42">今日もお疲れさまでした。振り返りは明朝でも大丈夫です</p>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-white/28">Evening review</span>
            <button
              type="button"
              onClick={() => onNavigate('evening')}
              className="rounded-full border border-white/[0.08] px-3 py-1 text-[11px] text-white/36 hover:text-white/60"
            >
              やっておく
            </button>
          </div>
        </div>
      )
    }
    return (
      <button
        type="button"
        onClick={() => onNavigate('evening')}
        className="flex w-full flex-col justify-start rounded-[28px] border border-[#c4b5fd]/20 bg-[radial-gradient(circle_at_top_left,rgba(196,181,253,0.16),transparent_42%),linear-gradient(180deg,rgba(9,16,27,0.98),rgba(8,13,22,0.92))] px-4 py-5 text-left shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#d2c6ff]">Active window</p>
        <p className="mt-2 text-lg font-semibold text-white">{greeting}</p>
        <p className="mt-1 text-sm text-white/62">{label}</p>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d2c6ff]">Evening review</span>
          <span className="rounded-full border border-[#d2c6ff]/25 bg-[#d2c6ff]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#ece7ff]">Open</span>
        </div>
      </button>
    )
  }
  return (
    <div className="rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(12,18,29,0.98),rgba(10,14,23,0.94))] px-4 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/35">System context</p>
      <p className="mt-2 text-lg font-semibold text-white">{greeting}</p>
      <p className="mt-1 text-sm text-white/62">{label}</p>
      <p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/35">Morning / Evening routines are available from navigation</p>
    </div>
  )
}

const GapSnapshotCard = ({
  summary,
  lines,
}: {
  summary: string
  lines: string[]
}) => (
  <div className="rounded-[28px] border border-[#7dd3fc]/18 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.12),transparent_42%),linear-gradient(180deg,rgba(9,16,27,0.98),rgba(8,13,22,0.92))] px-4 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8ed8ff]">Gap snapshot</p>
    <p className="mt-2 text-lg font-semibold text-white">{summary}</p>
    <div className="mt-4 space-y-2">
      {lines.map((line, index) => (
        <div key={`${line}-${index}`} className="flex items-start gap-2.5 rounded-xl border-l-2 border-l-[#7dd3fc]/40 bg-[#7dd3fc]/[0.05] px-3 py-2.5 text-sm text-white/65">
          <span className="mt-0.5 shrink-0 text-[#8ed8ff]/60">·</span>
          {line}
        </div>
      ))}
    </div>
  </div>
)

const TodayTasksCard = ({
  coreTasks,
  extraCount,
  completionRate,
  todayDone,
  todayTotal,
  morningDone,
  onOpen,
}: {
  coreTasks: Array<{ label: string; checked: boolean; minutes?: number }>
  extraCount: number
  completionRate: number
  todayDone: number
  todayTotal: number
  morningDone: boolean
  onOpen: () => void
}) => {
  if (morningDone) {
    return (
      <div className="rounded-[28px] border border-[#34d399]/25 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.10),transparent_50%),linear-gradient(180deg,rgba(9,16,27,0.98),rgba(8,13,22,0.92))] px-4 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#34d399]/60">Today tasks</p>
        <div className="mt-3 flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#34d399]/40 bg-[#34d399]/15 text-base text-[#34d399]">✓</span>
          <p className="text-lg font-semibold text-[#7ef0be]">モーニング完了</p>
        </div>
        <p className="mt-2 text-sm text-[#34d399]/60">{todayDone} / {todayTotal} タスク達成</p>
        <button type="button" onClick={onOpen} className="mt-4 rounded-full border border-[#34d399]/25 bg-[#34d399]/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7ef0be]">
          詳細を見る
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-[28px] border border-white/[0.08] bg-[#0b1320]/90 px-4 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">Today tasks</p>
          <p className="mt-2 text-lg font-semibold text-white">今朝の core 3 と残りを把握します。</p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">完了率</p>
          <p className="mt-1 text-xl font-semibold text-white">{completionRate}%</p>
          <p className="text-[11px] text-white/32">{todayDone} / {todayTotal}</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {coreTasks.map(task => (
          <div
            key={task.label}
            className={['flex items-center justify-between rounded-2xl border px-3 py-3 transition-colors', task.checked ? 'border-white/[0.04] bg-white/[0.01]' : 'border-white/[0.06] bg-white/[0.02]'].join(' ')}
            style={!task.checked ? { animation: 'pulse-subtle 3s ease-in-out infinite' } : undefined}
          >
            <div className="min-w-0">
              <p className={['text-sm', task.checked ? 'text-white/30 line-through' : 'text-white/86'].join(' ')}>{task.label}</p>
              {task.minutes ? <p className="mt-1 text-[11px] text-white/28">{task.minutes}m</p> : null}
            </div>
            <span className={['rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]', task.checked ? 'border-[#34d399]/25 bg-[#34d399]/10 text-[#7ef0be]' : 'border-white/[0.08] bg-white/[0.03] text-white/45'].join(' ')}>
              {task.checked ? 'done' : 'open'}
            </span>
          </div>
        ))}
        {extraCount > 0 && (
          <div className="flex items-center gap-3 rounded-2xl border border-[#ff6b35]/20 bg-[#ff6b35]/6 px-3 py-3">
            <span className="text-2xl font-bold text-[#ff9966]">{extraCount}</span>
            <span className="text-sm text-white/50">件残り — 潰してしまおう</span>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="mt-4 rounded-full border border-[#7dd3fc]/30 bg-[#7dd3fc]/12 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#aee5ff]"
      >
        Open morning
      </button>
    </div>
  )
}

const IdentityAnchorCard = ({
  title,
  sub,
}: {
  title: string
  sub: string
}) => (
  <div className="rounded-[28px] border border-[#f59e0b]/18 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_42%),linear-gradient(180deg,rgba(9,16,27,0.98),rgba(8,13,22,0.92))] px-4 py-5">
    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#f5c46b]">Identity anchor</p>
    <p className="mt-2 text-lg font-semibold text-white">{title}</p>
    <p className="mt-2 text-sm leading-relaxed text-white/48">{sub}</p>
  </div>
)

const TodayGoalCard = ({
  goal,
  completed,
  onOpen,
}: {
  goal: string | null
  completed: boolean
  onOpen: () => void
}) => (
  <div className={['rounded-[28px] border px-4 py-5', completed ? 'border-[#34d399]/25 bg-[#34d399]/6' : 'border-white/[0.08] bg-[#0b1320]/90'].join(' ')}>
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/35">Today goal</p>
        <p className={['mt-2 text-lg font-semibold', completed ? 'text-white/42 line-through' : 'text-white'].join(' ')}>
          {goal ?? '未設定'}
        </p>
      </div>
      <span className={['rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]', completed ? 'border-[#34d399]/25 bg-[#34d399]/10 text-[#7ef0be]' : 'border-[#7dd3fc]/25 bg-[#7dd3fc]/10 text-[#aee5ff]'].join(' ')}>
        {completed ? 'closed' : 'focus'}
      </span>
    </div>
    <p className="mt-2 text-sm text-white/46">
      今日の勝ち筋を1件に固定します。未設定なら check-in から反映できます。
    </p>
    <button
      type="button"
      onClick={onOpen}
      className="mt-4 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/58"
    >
      Open evening
    </button>
  </div>
)

const MorningCheckinCard = ({
  transcript,
  journal,
  onTranscriptChange,
  onImportJournal,
  onGenerate,
  onApplyGoal,
  onApplyTasks,
  onApplyGap,
  parsed,
  loading,
  listening,
  onToggleListening,
}: {
  transcript: string
  journal: string
  onTranscriptChange: (value: string) => void
  onImportJournal: () => void
  onGenerate: () => void
  onApplyGoal: () => void
  onApplyTasks: () => void
  onApplyGap: () => void
  parsed: MorningCheckinParse | null
  loading: boolean
  listening: boolean
  onToggleListening: () => void
}) => (
  <div className="rounded-[28px] border border-[#c4b5fd]/18 bg-[radial-gradient(circle_at_top_left,rgba(196,181,253,0.14),transparent_44%),linear-gradient(180deg,rgba(9,16,27,0.98),rgba(8,13,22,0.92))] px-4 py-5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#d2c6ff]">Morning check-in</p>
        <p className="mt-2 text-lg font-semibold text-white">1回の入力で朝の認知を揃えます。</p>
      </div>
      <button
        type="button"
        onClick={onToggleListening}
        className={['rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]', listening ? 'border-[#fca5a5]/30 bg-[#fca5a5]/10 text-[#fecaca]' : 'border-[#d2c6ff]/25 bg-[#d2c6ff]/10 text-[#ece7ff]'].join(' ')}
      >
        {listening ? 'Stop voice' : 'Start voice'}
      </button>
    </div>
    <textarea
      value={transcript}
      onChange={(e) => onTranscriptChange(e.target.value)}
      rows={6}
      placeholder="例: 昨日は英語が進まず、今月のギャップを感じています。今日は英語を最優先にして、理想の自分に近づきたい..."
      className="mt-4 w-full rounded-2xl border border-white/10 bg-[#0b1320] px-3 py-3 text-sm leading-relaxed text-white placeholder-white/20"
    />
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onGenerate}
        disabled={loading || !(transcript.trim() || journal.trim())}
        className="rounded-full border border-[#7dd3fc]/30 bg-[#7dd3fc]/12 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#aee5ff] disabled:opacity-40"
      >
        {loading ? 'Generating' : 'Generate check-in'}
      </button>
      {journal.trim() && (
        <button
          type="button"
          onClick={onImportJournal}
          className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/54"
        >
          Import journal
        </button>
      )}
      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/42">
        voice input falls back to text when unsupported
      </span>
    </div>
    {journal.trim() && (
      <p className="mt-3 text-[11px] text-white/38">
        journal source is available. Generate check-in can use it even if the transcript is empty.
      </p>
    )}

    {parsed && (
      <div className="mt-5 space-y-3">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Parsed gap</p>
          <p className="mt-2 text-sm text-white/76">{parsed.gap_summary}</p>
          <button type="button" onClick={onApplyGap} className="mt-3 rounded-full border border-white/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
            Apply gap
          </button>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Today goal</p>
          <p className="mt-2 text-sm text-white/76">{parsed.today_goal}</p>
          <button type="button" onClick={onApplyGoal} className="mt-3 rounded-full border border-[#7dd3fc]/25 bg-[#7dd3fc]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#aee5ff]">
            Apply goal
          </button>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Identity anchor</p>
          <p className="mt-2 text-sm text-white/76">{parsed.identity_anchor}</p>
        </div>
        {parsed.task_candidates.length > 0 && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Task candidates</p>
            <div className="mt-2 space-y-2">
              {parsed.task_candidates.map((task) => (
                <div key={task.label} className="rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2">
                  <p className="text-sm text-white/82">{task.label}</p>
                  <p className="mt-1 text-[11px] text-white/36">{task.reason}</p>
                </div>
              ))}
            </div>
            <button type="button" onClick={onApplyTasks} className="mt-3 rounded-full border border-[#d2c6ff]/25 bg-[#d2c6ff]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#ece7ff]">
              Apply tasks
            </button>
          </div>
        )}
      </div>
    )}
  </div>
)

// ─── DoneBanner ─────────────────────────────────────────────
const DoneBanner = ({
  type,
  onDismiss,
  aiContext,
}: {
  type: 'morning' | 'evening'
  onDismiss: () => void
  aiContext: Record<string, unknown>
}) => {
  const [aiComment, setAiComment] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const color = type === 'morning' ? '#22c55e' : '#a78bfa'
  const borderColor = type === 'morning' ? 'border-[#22c55e]/30 bg-[#22c55e]/8' : 'border-[#a78bfa]/30 bg-[#a78bfa]/8'

  const handleAiComment = async () => {
    setLoading(true)
    try {
      const prompt = type === 'morning'
        ? buildMorningCommentPrompt(aiContext as Parameters<typeof buildMorningCommentPrompt>[0])
        : buildEveningCommentPrompt(aiContext as Parameters<typeof buildEveningCommentPrompt>[0])
      const comment = await callClaude([{ role: 'user', content: prompt }])
      setAiComment(comment)
    } catch {
      setAiComment('コメントの取得に失敗しました。ログイン状態またはサーバー側のAI設定を確認してください。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={['space-y-3 rounded-2xl border px-4 py-4', borderColor].join(' ')}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color }}>
            {type === 'morning' ? 'Morning sequence complete' : 'Evening review complete'}
          </p>
          <p className="mt-1 text-sm font-semibold text-white/88">
            {type === 'morning' ? 'Morning actions are complete.' : 'Evening review is complete.'}
          </p>
          <p className="mt-1 text-[11px] text-white/40">
            {type === 'morning' ? 'Morning items are fully recorded.' : 'Today’s review has been recorded.'}
          </p>
        </div>
        <button type="button" onClick={onDismiss} className="text-white/30 hover:text-white/60 text-lg leading-none">×</button>
      </div>

      {/* AIコメント */}
      {aiComment ? (
        <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">AI note</p>
          <p className="mt-2 text-xs leading-relaxed text-white/70">{aiComment}</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleAiComment}
          disabled={loading}
          className="rounded-full border border-white/10 px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-white/60 hover:text-white disabled:opacity-40"
          style={{ borderColor: `${color}40`, color }}
        >
          {loading ? 'Generating' : 'Open AI note'}
        </button>
      )}
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
  const { boss, setBoss } = useBossStorage()
  const [todoDefinitions, setTodoDefinitions] = useTodoDefinitions()
  const [goals] = useLocalStorage<GoalRecord[]>('wannabe:goals', [])
  const morningItems = byTiming(todoDefinitions, 'morning')
  const morningMustCount = morningItems.filter(i => i.isMust).length
  const morningRoutineCount = morningItems.filter(i => !i.isMust).length
  const morningMustItems = morningItems.filter(i => i.isMust)
  const morningRoutineItems = morningItems.filter(i => !i.isMust)
  const visibleMorningIds = new Set(morningItems.map(item => item.id))
  const [checkedArr] = useTodayStorage<string[]>('morning:checked', [])
  const [targets] = useMonthlyTargets(DEFAULT_TARGETS)
  const [checkinTranscript, setCheckinTranscript] = useTodayStorage<string>('morning:checkin:transcript', '')
  const [checkinSummary, setCheckinSummary] = useTodayStorage<string>('morning:checkin:summary', '')
  const [parsedCheckin, setParsedCheckin] = useTodayStorage<MorningCheckinParse | null>('morning:checkin:parse', null)
  const [morningJournal] = useTodayStorage<string>('morning:journal', '')
  // 夜AIコメント用の文脈データ
  const [eveningGap] = useTodayStorage<string>('evening:gap', '')
  const [eveningInsight] = useTodayStorage<string>('evening:insight', '')
  const [eveningTomorrow] = useTodayStorage<string>('evening:tomorrow', '')
  const [eveningCheckedArr] = useTodayStorage<string[]>('evening:checked', [])
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const [listening, setListening] = useState(false)
  const [checkinLoading, setCheckinLoading] = useState(false)

  const monthlyCounts = useMemo(() => countMonthlyChecks('morning:checked'), [])
  const allTimeBests = useMemo(() => getAllTimeBests(), [])

  const bossValue = boss?.value ?? null
  const bossCompleted = boss?.completed ?? false

  const todayDone = checkedArr.filter(id => visibleMorningIds.has(id)).length
  const todayTotal = morningMustCount + morningRoutineCount

  const completionRate = todayTotal > 0 ? Math.round((todayDone / todayTotal) * 100) : 0
  const anchorGoal = goals.find(goal => goal.priority === 'critical') ?? goals.find(goal => goal.priority === 'high')
  const underTarget = HABIT_DEFS
    .map(habit => ({
      ...habit,
      actual: monthlyCounts[habit.id] ?? 0,
      target: targets[habit.id] ?? habit.defaultTarget,
      rate: (monthlyCounts[habit.id] ?? 0) / Math.max(targets[habit.id] ?? habit.defaultTarget, 1),
    }))
    .sort((a, b) => a.rate - b.rate)[0]
  const coreTasks = [...morningMustItems, ...morningRoutineItems]
    .slice(0, 3)
    .map(item => ({ label: item.label, checked: checkedArr.includes(item.id), minutes: item.minutes }))
  const extraCount = Math.max(morningMustItems.length + morningRoutineItems.length - coreTasks.length, 0)
  const morningTaskLabels = [...morningMustItems, ...morningRoutineItems].map(item => item.label)
  const gapSummary = checkinSummary || [
    eveningGap ? `前夜の gap: ${eveningGap}` : '前夜の gap は未記録です。',
    underTarget ? `${underTarget.label} が今月 ${underTarget.actual}/${underTarget.target} で遅れています。` : '今月の遅れ習慣はまだ見えていません。',
    bossValue ? `today goal は ${bossValue} です。` : 'today goal が未設定です。',
  ].join(' ')
  const gapLines = [
    eveningGap ? `前夜の差分: ${eveningGap}` : '前夜の差分が未記録です。',
    underTarget ? `${underTarget.label} が今月の最弱ポイントです。` : '月次の弱点はまだ明確ではありません。',
    anchorGoal ? `判断基準は「${anchorGoal.title}」です。` : '理想像の判断基準を先に定義すると朝の迷いが減ります。',
  ]

  const eveningDone = eveningCheckedArr.length > 0
  const morningDone = todayTotal > 0 && todayDone >= todayTotal

  const handleToggleListening = () => {
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop()
      setListening(false)
      return
    }

    const Recognition = getSpeechRecognition()
    if (!Recognition) return

    const recognition = new Recognition()
    recognition.lang = 'ja-JP'
    recognition.interimResults = true
    recognition.continuous = true
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0]?.transcript ?? '')
        .join('')
      setCheckinTranscript(transcript)
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)
    recognition.start()
    recognitionRef.current = recognition
    setListening(true)
  }

  const handleGenerateCheckin = async () => {
    const sourceText = checkinTranscript.trim() || morningJournal.trim()
    if (!sourceText) return
    setCheckinLoading(true)
    try {
      const parsed = await generateMorningCheckinParse({
        transcript: sourceText,
        currentGap: gapSummary,
        currentIdentity: anchorGoal?.title ?? '',
        currentGoal: bossValue ?? '',
      })
      setParsedCheckin(parsed ?? fallbackMorningParse(sourceText, gapSummary, anchorGoal?.title ?? '', bossValue ?? ''))
    } catch {
      setParsedCheckin(fallbackMorningParse(sourceText, gapSummary, anchorGoal?.title ?? '', bossValue ?? ''))
    } finally {
      setCheckinLoading(false)
    }
  }

  const handleImportJournal = () => {
    if (!morningJournal.trim()) return
    setCheckinTranscript(morningJournal)
  }

  const handleApplyGoal = () => {
    if (!parsedCheckin?.today_goal.trim()) return
    setBoss(parsedCheckin.today_goal.trim())
  }

  const handleApplyGap = () => {
    if (!parsedCheckin?.gap_summary.trim()) return
    setCheckinSummary(parsedCheckin.gap_summary.trim())
  }

  const handleApplyTasks = () => {
    if (!parsedCheckin?.task_candidates.length) return
    setTodoDefinitions(prev => {
      const existing = new Set(prev.map(todo => todo.label.trim().toLowerCase()))
      const additions = parsedCheckin.task_candidates
        .filter(task => task.label.trim())
        .filter(task => !existing.has(task.label.trim().toLowerCase()))
        .map(task => ({
          id: createTodoId(task.label),
          label: task.label.trim(),
          section: 'system' as import('@/lib/todos').HabitCategory,
          timing: 'morning' as import('@/lib/todos').HabitTiming,
          isMust: false,
          is_active: true,
        }))
      return [...prev, ...additions]
    })
  }

  return (
    <div className="grid gap-4 px-4 py-4 pb-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <ContextCard
        period={ctx.period}
        greeting={ctx.greeting}
        label={ctx.label}
        onNavigate={onNavigate}
        eveningDone={eveningDone}
        morningDone={morningDone}
      />

      <GapSnapshotCard summary={gapSummary} lines={gapLines} />

      {ctx.period !== 'evening' && (
        <MorningCheckinCard
          transcript={checkinTranscript}
          journal={morningJournal}
          onTranscriptChange={setCheckinTranscript}
          onImportJournal={handleImportJournal}
          onGenerate={handleGenerateCheckin}
          onApplyGoal={handleApplyGoal}
          onApplyTasks={handleApplyTasks}
          onApplyGap={handleApplyGap}
          parsed={parsedCheckin}
          loading={checkinLoading}
          listening={listening}
          onToggleListening={handleToggleListening}
        />
      )}

      <MorningCheckinDiffPanel
        transcript={checkinTranscript}
        parsed={parsedCheckin}
        currentGap={checkinSummary}
        currentGoal={bossValue}
        currentIdentity={anchorGoal?.title ?? ''}
        currentMorningTasks={morningTaskLabels}
        onOpenMorning={() => onNavigate('morning')}
      />

      {morningDoneBanner && (
        <div className="xl:col-span-2">
          <DoneBanner
            type="morning"
            onDismiss={onClearMorningBanner ?? (() => {})}
            aiContext={{
              checkedCount: checkedArr.length,
              totalCount: todayTotal,
              boss: bossValue,
              monthlyCounts,
              targets,
            }}
          />
        </div>
      )}
      {eveningDoneBanner && (
        <div className="xl:col-span-2">
          <DoneBanner
            type="evening"
            onDismiss={onClearEveningBanner ?? (() => {})}
            aiContext={{
              gap: eveningGap,
              insight: eveningInsight,
              tomorrow: eveningTomorrow,
              checkedCount: eveningCheckedArr.length,
              totalCount: 9,
              boss: bossValue,
              bossCompleted,
            }}
          />
        </div>
      )}

      <TodayTasksCard
        coreTasks={coreTasks}
        extraCount={extraCount}
        completionRate={completionRate}
        todayDone={todayDone}
        todayTotal={todayTotal}
        morningDone={morningDone}
        onOpen={() => onNavigate('morning')}
      />

      <div className="space-y-4">
        <IdentityAnchorCard
          title={parsedCheckin?.identity_anchor || anchorGoal?.title || '理想像の基準をまだ定義していません'}
          sub={anchorGoal?.sub || '今日の判断を狭める基準を1つに固定すると、タスク選択の精度が上がります。'}
        />
        <TodayGoalCard
          goal={parsedCheckin?.today_goal || bossValue}
          completed={bossCompleted}
          onOpen={() => onNavigate('evening')}
        />
      </div>

      <div className="xl:col-span-2">
        <div className="grid grid-cols-2 gap-3">
          <YesterdayCard onNavigate={onNavigate} />
          <div className="rounded-[24px] border border-white/[0.08] bg-[#0b1320]/90 px-4 py-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">Monthly signals</p>
                <p className="mt-1 text-sm text-white/72">進捗の強度と目標到達ペースを確認します。</p>
              </div>
              <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Analytics
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {HABIT_DEFS.map(h => (
                <ProgressRing
                  key={h.id}
                  label={h.label}
                  color={h.color}
                  target={targets[h.id] ?? h.defaultTarget}
                  actual={monthlyCounts[h.id] ?? 0}
                  best={allTimeBests[h.id]}
                  size={72}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1 xl:col-span-2">
        <button type="button" onClick={() => onNavigate('monthly')}
          className="rounded-2xl border border-white/[0.08] bg-[#111827]/70 px-4 py-4 text-left transition-colors hover:border-[#7dd3fc]/20 hover:bg-[#111b2d]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8ed8ff]">Reports</p>
          <p className="mt-2 text-sm font-semibold text-white/85">月次レビュー</p>
          <p className="mt-1 text-xs text-white/38">daily reports and monthly analysis</p>
        </button>
        <button type="button" onClick={() => onNavigate('wanna-be')}
          className="rounded-2xl border border-white/[0.08] bg-[#111827]/70 px-4 py-4 text-left transition-colors hover:border-[#f59e0b]/20 hover:bg-[#111b2d]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#f5c46b]">Identity</p>
          <p className="mt-2 text-sm font-semibold text-white/85">Wanna Be</p>
          <p className="mt-1 text-xs text-white/38">long-term direction and active goals</p>
        </button>
      </div>
    </div>
  )
}
