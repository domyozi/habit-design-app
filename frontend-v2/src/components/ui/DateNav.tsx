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

export const DateNav = ({ viewDate, onViewDateChange, maxPastDays = 7 }: DateNavProps) => {
  const today = todayKey()
  const isToday = viewDate === today

  const oldest = addDays(today, -maxPastDays)
  const canGoBack = viewDate > oldest
  const canGoForward = viewDate < today

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-[#0d0d0d]">
      {/* 前の日へ */}
      <button
        type="button"
        onClick={() => canGoBack && onViewDateChange(addDays(viewDate, -1))}
        disabled={!canGoBack}
        className="w-8 h-8 flex items-center justify-center rounded text-[#555] hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
        aria-label="前の日"
      >
        ‹
      </button>

      {/* 日付表示 */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono text-white">{formatLabel(viewDate)}</span>
        {isToday ? (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/30">
            今日
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onViewDateChange(today)}
            className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-[#555] border border-white/10 hover:text-white transition-colors"
          >
            今日に戻る
          </button>
        )}
      </div>

      {/* 次の日へ */}
      <button
        type="button"
        onClick={() => canGoForward && onViewDateChange(addDays(viewDate, 1))}
        disabled={!canGoForward}
        className="w-8 h-8 flex items-center justify-center rounded text-[#555] hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
        aria-label="次の日"
      >
        ›
      </button>
    </div>
  )
}
