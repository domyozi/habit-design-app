/**
 * カレンダービューコンポーネント
 * TASK-0021: 習慣トラッキング可視化
 *
 * 表示内容:
 * - 各日の習慣達成状況を色で表示
 *   - 全達成: 緑（bg-green-200）
 *   - 一部達成: 黄（bg-yellow-200）
 *   - 未達成あり: 赤（bg-red-100）
 *   - 未記録: グレー（bg-slate-100）
 * - 月切り替えボタン（前月/次月）
 * - 7列グリッドで表示（NFR-201: モバイル対応）
 *
 * 🟡 信頼性レベル: REQ-506 一般的な習慣アプリから妥当な推測
 */

export type DayStatus = 'all' | 'partial' | 'none'

interface CalendarViewProps {
  year: number
  month: number
  dayStatuses: Record<string, DayStatus>
  onMonthChange: (year: number, month: number) => void
}

const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日']

const getDayColorClass = (status: DayStatus | undefined): string => {
  switch (status) {
    case 'all':
      return 'bg-green-200'
    case 'partial':
      return 'bg-yellow-200'
    case 'none':
      return 'bg-red-100'
    default:
      return 'bg-slate-100'
  }
}

const formatDate = (year: number, month: number, day: number): string => {
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

export const CalendarView = ({
  year,
  month,
  dayStatuses,
  onMonthChange,
}: CalendarViewProps) => {
  // 月の日数と開始曜日を計算（月曜始まり）
  const firstDay = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  // getDay(): 0=日 1=月...6=土 → 月曜始まりに変換（月=0, ..., 日=6）
  const startDayOfWeek = (firstDay.getDay() + 6) % 7

  // 前月/次月の計算
  const handlePrevMonth = () => {
    if (month === 1) {
      onMonthChange(year - 1, 12)
    } else {
      onMonthChange(year, month - 1)
    }
  }

  const handleNextMonth = () => {
    if (month === 12) {
      onMonthChange(year + 1, 1)
    } else {
      onMonthChange(year, month + 1)
    }
  }

  // カレンダーのセルを構築（空白 + 日付）
  const cells: Array<{ day: number | null; dateStr: string | null }> = []
  for (let i = 0; i < startDayOfWeek; i++) {
    cells.push({ day: null, dateStr: null })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateStr: formatDate(year, month, d) })
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      {/* ヘッダー: 月ナビゲーション */}
      <div className="mb-4 flex items-center justify-between">
        <button
          data-testid="prev-month-button"
          type="button"
          onClick={handlePrevMonth}
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="前月"
        >
          ‹
        </button>
        <h2 className="text-sm font-semibold text-slate-700">
          {year}年{month}月
        </h2>
        <button
          data-testid="next-month-button"
          type="button"
          onClick={handleNextMonth}
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="次月"
        >
          ›
        </button>
      </div>

      {/* 曜日ラベル */}
      <div className="mb-1 grid grid-cols-7 text-center">
        {DAY_LABELS.map((label) => (
          <div key={label} className="py-1 text-xs font-medium text-slate-400">
            {label}
          </div>
        ))}
      </div>

      {/* カレンダーグリッド */}
      <div
        data-testid="calendar-grid"
        className="grid grid-cols-7 gap-1"
      >
        {cells.map((cell, idx) => {
          if (cell.day === null) {
            return <div key={`empty-${idx}`} className="aspect-square" />
          }
          const status = cell.dateStr ? dayStatuses[cell.dateStr] : undefined
          const colorClass = getDayColorClass(status)
          return (
            <div
              key={cell.dateStr}
              data-testid={`day-${cell.dateStr}`}
              className={`flex aspect-square items-center justify-center rounded-lg text-xs font-medium text-slate-700 ${colorClass}`}
            >
              {cell.day}
            </div>
          )
        })}
      </div>

      {/* 凡例 */}
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm bg-green-200" />全達成
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm bg-yellow-200" />一部達成
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm bg-red-100" />未達成あり
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm bg-slate-100" />未記録
        </span>
      </div>
    </div>
  )
}
