import { todayKey } from '@/lib/storage'

interface DateNavProps {
  viewDate: string
  onViewDateChange: (date: string) => void
  /** 何日前まで遡れるか（デフォルト 7）*/
  maxPastDays?: number
}

const formatLabel = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  return `${m}/${d}（${weekdays[date.getDay()]}）`
}

const addDays = (dateStr: string, days: number): string => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

const ChevronLeft = ({ dim }: { dim?: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ opacity: dim ? 0.2 : 1 }}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
)

const ChevronRight = ({ dim }: { dim?: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ opacity: dim ? 0.2 : 1 }}>
    <path d="M9 18l6-6-6-6" />
  </svg>
)

export const DateNav = ({ viewDate, onViewDateChange, maxPastDays = 7 }: DateNavProps) => {
  const today = todayKey()
  const isToday = viewDate === today

  const oldest = addDays(today, -maxPastDays)
  const canGoBack = viewDate > oldest
  const canGoForward = viewDate < today

  return (
    <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#06090f] px-3 py-1.5">
      {/* 前の日へ */}
      <button
        type="button"
        onClick={() => canGoBack && onViewDateChange(addDays(viewDate, -1))}
        disabled={!canGoBack}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed"
        aria-label="前の日"
      >
        <ChevronLeft dim={!canGoBack} />
      </button>

      {/* 日付表示 */}
      <div className="flex flex-1 items-center justify-center gap-2">
        <span className="text-sm font-semibold text-white/90">{formatLabel(viewDate)}</span>
        {isToday ? (
          <span className="rounded border border-[#22c55e]/30 bg-[#22c55e]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#22c55e]">
            今日
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onViewDateChange(today)}
            className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-semibold text-white/45 transition-colors hover:text-white"
          >
            今日に戻る →
          </button>
        )}
      </div>

      {/* 次の日へ */}
      <button
        type="button"
        onClick={() => canGoForward && onViewDateChange(addDays(viewDate, 1))}
        disabled={!canGoForward}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed"
        aria-label="次の日"
      >
        <ChevronRight dim={!canGoForward} />
      </button>
    </div>
  )
}
