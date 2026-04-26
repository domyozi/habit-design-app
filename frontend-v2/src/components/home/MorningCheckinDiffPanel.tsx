import { useMemo, type ReactNode } from 'react'
import type { MorningCheckinParse } from '@/lib/ai'

interface MorningCheckinDiffPanelProps {
  transcript: string
  parsed: MorningCheckinParse | null
  currentGap: string
  currentGoal: string | null
  currentIdentity: string
  currentMorningTasks: string[]
  onOpenMorning: () => void
}

const DiffBadge = ({ tone, children }: { tone: 'pending' | 'applied' | 'neutral'; children: ReactNode }) => {
  const palette = {
    pending: 'border-[#f59e0b]/20 bg-[#f59e0b]/8 text-[#fbd38d]',
    applied: 'border-[#34d399]/20 bg-[#34d399]/8 text-[#7ef0be]',
    neutral: 'border-white/[0.08] bg-white/[0.03] text-white/42',
  }[tone]

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${palette}`}>
      {children}
    </span>
  )
}

const DiffBlock = ({
  title,
  before,
  after,
  tone,
  note,
}: {
  title: string
  before: string
  after: string
  tone: 'pending' | 'applied' | 'neutral'
  note: string
}) => (
  <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-3">
    <div className="flex items-center justify-between gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">{title}</p>
      <DiffBadge tone={tone}>{tone === 'applied' ? 'Applied' : tone === 'pending' ? 'Pending' : 'Review'}</DiffBadge>
    </div>
    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-white/28">before</p>
    <p className="mt-1 text-sm text-white/72">{before || '（未設定）'}</p>
    <p className="mt-3 text-xs uppercase tracking-[0.16em] text-white/28">after</p>
    <p className="mt-1 text-sm text-white/92">{after || '（未設定）'}</p>
    <p className="mt-2 text-[11px] text-white/38">{note}</p>
  </div>
)

export const MorningCheckinDiffPanel = ({
  transcript,
  parsed,
  currentGap,
  currentGoal,
  currentIdentity,
  currentMorningTasks,
  onOpenMorning,
}: MorningCheckinDiffPanelProps) => {
  const currentTaskSet = useMemo(() => new Set(currentMorningTasks.map(task => task.trim().toLowerCase())), [currentMorningTasks])

  const taskCandidates = parsed?.task_candidates ?? []
  const candidateLabels = taskCandidates.map(task => task.label.trim()).filter(Boolean)
  const newCandidates = candidateLabels.filter(label => !currentTaskSet.has(label.toLowerCase()))
  const alreadyReflected = candidateLabels.filter(label => currentTaskSet.has(label.toLowerCase()))
  const gapApplied = Boolean(parsed?.gap_summary.trim()) && parsed?.gap_summary.trim() === currentGap.trim()
  const goalApplied = Boolean(parsed?.today_goal.trim()) && parsed?.today_goal.trim() === (currentGoal ?? '').trim()
  const tasksApplied = candidateLabels.length > 0 && newCandidates.length === 0
  const pendingCount = [gapApplied, goalApplied, tasksApplied].filter(Boolean).length

  return (
    <div className="rounded-[28px] border border-[#7dd3fc]/18 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.1),transparent_38%),linear-gradient(180deg,rgba(9,16,27,0.98),rgba(8,13,22,0.92))] px-4 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8ed8ff]">Morning diff</p>
          <p className="mt-2 text-lg font-semibold text-white">入力・解釈・反映の差分を1枚で確認します。</p>
          <p className="mt-1 text-sm text-white/52">AI の提案をそのまま保存せず、どこが変わるかを先に見せる面です。</p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Reflected</p>
          <p className="mt-1 text-xl font-semibold text-white">{pendingCount}/3</p>
          <p className="text-[11px] text-white/35">confirmed changes</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Input</p>
            <DiffBadge tone={transcript.trim() ? 'applied' : 'neutral'}>{transcript.trim() ? 'Captured' : 'Waiting'}</DiffBadge>
          </div>
          <p className="mt-2 text-xs text-white/34">morning check-in transcript</p>
          <div className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/[0.06] bg-[#09111c] px-3 py-3 text-sm leading-relaxed text-white/78">
            {transcript.trim() || '音声またはテキストで朝のチェックインを入力すると、ここに原文が残ります。'}
          </div>
          <p className="mt-3 text-[11px] text-white/38">
            identity anchor: {currentIdentity || '未設定'}
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-3 space-y-3">
          <DiffBlock
            title="Gap"
            before={currentGap}
            after={parsed?.gap_summary ?? ''}
            tone={gapApplied ? 'applied' : parsed?.gap_summary ? 'pending' : 'neutral'}
            note="昨日からの差分を朝の判断基準に変換します。"
          />
          <DiffBlock
            title="Today goal"
            before={currentGoal ?? ''}
            after={parsed?.today_goal ?? ''}
            tone={goalApplied ? 'applied' : parsed?.today_goal ? 'pending' : 'neutral'}
            note="1日の勝ち筋を1件に固定します。"
          />
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Task diff</p>
            <DiffBadge tone={tasksApplied ? 'applied' : candidateLabels.length ? 'pending' : 'neutral'}>
              {tasksApplied ? 'Applied' : candidateLabels.length ? 'Pending' : 'Idle'}
            </DiffBadge>
          </div>
          <p className="mt-2 text-sm text-white/70">current morning tasks: {currentMorningTasks.length} items</p>
          <p className="mt-1 text-xs text-white/36">AI candidates: {candidateLabels.length} items</p>

          <div className="mt-3 space-y-2">
            {candidateLabels.length > 0 ? (
              candidateLabels.map(label => {
                const isNew = newCandidates.includes(label)
                return (
                  <div key={label} className="rounded-xl border border-white/[0.06] bg-[#09111c] px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-white/84">{label}</p>
                      <DiffBadge tone={isNew ? 'pending' : 'applied'}>{isNew ? 'New' : 'Existing'}</DiffBadge>
                    </div>
                    <p className="mt-1 text-[11px] text-white/36">
                      {taskCandidates.find(item => item.label.trim() === label)?.reason ?? 'AI suggested task'}
                    </p>
                  </div>
                )
              })
            ) : (
              <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-3 text-sm text-white/38">
                タスク候補がまだありません。チェックインを生成すると差分が見えるようになります。
              </div>
            )}
          </div>

          {alreadyReflected.length > 0 && (
            <p className="mt-3 text-[11px] text-white/38">already reflected: {alreadyReflected.join(' / ')}</p>
          )}

          <button
            type="button"
            onClick={onOpenMorning}
            className="mt-4 rounded-full border border-[#7dd3fc]/30 bg-[#7dd3fc]/12 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#aee5ff]"
          >
            Open morning
          </button>
        </div>
      </div>
    </div>
  )
}
