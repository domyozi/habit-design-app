import { useTimeContext } from '@/lib/timeContext'
import { useBossStorage, useTodayStorage } from '@/lib/storage'
import { byTiming, useTodoDefinitions } from '@/lib/todos'
import type { TabId } from '@/types'

// ─── FocusCard ───────────────────────────────────────────────
const FocusCard = ({
  boss,
  bossCompleted,
  morningDone,
  eveningDone,
  period,
  onNavigate,
  onBossReopen,
}: {
  boss: string | null
  bossCompleted: boolean
  morningDone: boolean
  eveningDone: boolean
  period: 'morning' | 'evening' | 'other'
  onNavigate: (tab: TabId) => void
  onBossReopen?: () => void
}) => {
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
        {bossCompleted ? (
          <button
            type="button"
            onClick={onBossReopen}
            className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors"
            style={{
              borderColor: `${accentColor}30`,
              backgroundColor: `${accentColor}12`,
              color: accentColor,
            }}
          >
            reopen
          </button>
        ) : (
          <span
            className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
            style={{
              borderColor: `${accentColor}30`,
              backgroundColor: `${accentColor}12`,
              color: accentColor,
            }}
          >
            focus
          </span>
        )}
      </div>

      {/* Primary Target */}
      {boss ? (
        <p className={['mt-3 text-2xl font-semibold leading-snug', bossCompleted ? 'text-white/40 line-through' : 'text-white'].join(' ')}>
          {boss}
        </p>
      ) : (
        <div className="mt-3">
          <p className="text-lg text-white/40 italic">今日の焦点を設定してください</p>
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
    </div>
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
  const { boss, toggleCompleted } = useBossStorage()
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

  return (
    <div className="space-y-3 px-4 py-4 pb-8">

      {/* 完了バナー */}
      {morningDoneBanner && (
        <DoneBanner type="morning" onDismiss={onClearMorningBanner ?? (() => {})} />
      )}
      {eveningDoneBanner && (
        <DoneBanner type="evening" onDismiss={onClearEveningBanner ?? (() => {})} />
      )}

      {/* Hero: 今日の焦点 */}
      <FocusCard
        boss={bossValue}
        bossCompleted={bossCompleted}
        morningDone={morningDone}
        eveningDone={eveningDone}
        period={ctx.period}
        onNavigate={onNavigate}
        onBossReopen={toggleCompleted}
      />
    </div>
  )
}
