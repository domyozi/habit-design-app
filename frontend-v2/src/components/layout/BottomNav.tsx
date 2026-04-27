import { useState, useEffect, useRef } from 'react'
import type { TabId } from '@/types'

const NAV_ITEMS: { id: TabId | 'cal'; label: string; short: string }[] = [
  { id: 'home',    label: 'Home', short: 'HM' },
  { id: 'morning', label: '朝',   short: 'AM' },
  { id: 'evening', label: '夜',   short: 'PM' },
  { id: 'cal',     label: 'Cal',  short: 'DT' },
  { id: 'more',    label: 'More', short: 'MX' },
]

const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const buildDates = (n = 7): Array<{ dateStr: string; label: string; weekday: string }> => {
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const label = i === 0 ? '今日' : i === 1 ? '昨日' : `${d.getMonth() + 1}/${d.getDate()}`
    const weekday = weekdays[d.getDay()]
    return { dateStr, label, weekday }
  })
}

const FloatingDatePicker = ({
  viewDate,
  onSelect,
  onClose,
}: {
  viewDate: string
  onSelect: (d: string) => void
  onClose: () => void
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const dates = buildDates(7)

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 right-0 border-t border-white/[0.06] bg-[#07111d]/96 backdrop-blur-xl px-2 py-3"
    >
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {dates.map(({ dateStr, label, weekday }) => {
          const isActive = viewDate === dateStr
          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onSelect(dateStr)}
              className={[
                'flex shrink-0 flex-col items-center gap-0.5 rounded-2xl border px-3 py-2 transition-colors',
                isActive
                  ? 'border-[#7dd3fc]/30 bg-[#7dd3fc]/12 text-[#7dd3fc]'
                  : 'border-white/[0.06] bg-white/[0.02] text-white/50 hover:text-white/80',
              ].join(' ')}
            >
              <span className="text-[11px] font-semibold">{label}</span>
              <span className="text-[10px] opacity-60">{weekday}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const NavGlyph = ({ id, active }: { id: TabId | 'cal'; active: boolean }) => {
  const color = active ? '#d7e3f4' : 'rgba(255,255,255,0.35)'

  if (id === 'home') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 11.5 12 5l8 6.5" />
        <path d="M6.5 10.5V19h11v-8.5" />
      </svg>
    )
  }

  if (id === 'morning') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 15c1.2-2.4 3.4-4 6-4s4.8 1.6 6 4" />
        <path d="M4 19h16" />
        <path d="M12 5v2.5" />
        <path d="M7.5 7.5 9 9" />
        <path d="m16.5 7.5-1.5 1.5" />
      </svg>
    )
  }

  if (id === 'evening') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15.5 4.5a7 7 0 1 0 4 12.7 7.6 7.6 0 0 1-4.5 1.3 7 7 0 0 1-6.8-8.7 7.4 7.4 0 0 1 7.3-5.3Z" />
      </svg>
    )
  }

  if (id === 'cal') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M16 3v4M8 3v4M4 10h16" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 7h14" />
      <path d="M5 12h14" />
      <path d="M5 17h14" />
    </svg>
  )
}

interface BottomNavProps {
  active: TabId
  onChange: (id: TabId) => void
  currentPeriod?: 'morning' | 'evening' | null
  viewDate?: string
  onViewDateChange?: (d: string) => void
}

export const BottomNav = ({ active, onChange, currentPeriod, viewDate, onViewDateChange }: BottomNavProps) => {
  const [showCal, setShowCal] = useState(false)
  const today = todayKey()
  const effectiveViewDate = viewDate ?? today

  const handleDateSelect = (date: string) => {
    onViewDateChange?.(date)
    setShowCal(false)
    const isMorningOrEvening = ['morning', 'journal', 'evening'].includes(active)
    if (!isMorningOrEvening) {
      onChange('morning')
    }
  }

  return (
    <nav
      className="fixed bottom-0 left-1/2 z-50 w-full max-w-[480px] -translate-x-1/2 border-t border-[#9fb4d1]/10 bg-[#07111d]/92 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="relative">
        {showCal && (
          <FloatingDatePicker
            viewDate={effectiveViewDate}
            onSelect={handleDateSelect}
            onClose={() => setShowCal(false)}
          />
        )}
        <div className="grid grid-cols-5 gap-1 px-2 py-2">
          {NAV_ITEMS.map(({ id, label, short }) => {
            const isCal = id === 'cal'
            const isActive = isCal ? showCal : active === (id as TabId)
            const showNudge =
              !isActive &&
              ((currentPeriod === 'morning' && id === 'morning') ||
               (currentPeriod === 'evening' && id === 'evening'))
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (isCal) {
                    setShowCal(p => !p)
                  } else {
                    setShowCal(false)
                    onChange(id as TabId)
                  }
                }}
                className={[
                  'relative flex flex-col items-center gap-1 rounded-2xl px-1 py-2.5 transition-colors',
                  isActive ? 'bg-[#dbe8ff]/[0.08]' : 'bg-transparent hover:bg-white/[0.03]',
                ].join(' ')}
              >
                <span className={[
                  'flex h-8 w-8 items-center justify-center rounded-xl border transition-colors',
                  isActive
                    ? 'border-[#dbe8ff]/20 bg-[#dbe8ff]/[0.06]'
                    : showNudge
                      ? 'border-[#7dd3fc]/25 bg-[#7dd3fc]/[0.05]'
                      : 'border-white/[0.06] bg-white/[0.02]',
                ].join(' ')}
                  style={showNudge ? { animation: 'time-nudge 2s ease-in-out infinite' } : undefined}
                >
                  <NavGlyph id={id} active={isActive} />
                </span>
                <span className={['text-[10px] font-semibold uppercase tracking-[0.22em]', isActive ? 'text-[#d7e3f4]' : showNudge ? 'text-[#7dd3fc]/70' : 'text-white/35'].join(' ')}>
                  {short}
                </span>
                <span className={['text-[10px] transition-colors', isActive ? 'text-white/80' : 'text-white/35'].join(' ')}>
                  {label}
                </span>
                {isActive && (
                  <span className="absolute inset-x-4 top-0 h-px rounded-full bg-[#dbe8ff]/70" />
                )}
                {showNudge && (
                  <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#7dd3fc]"
                    style={{ animation: 'time-nudge 1s ease-in-out infinite' }} />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
