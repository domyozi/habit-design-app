import { useRef, useState } from 'react'
import type { CalEvent } from '@/hooks/useGoogleCalendar'

const START_HOUR = 6
const END_HOUR = 23
const SLOT_MINUTES = 30
const TOTAL_SLOTS = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES

const DAYS_JA = ['月', '火', '水', '木', '金', '土', '日']
const COLORS = ['#38bdf8', '#22c55e', '#f59e0b', '#a78bfa', '#ff6b35', '#f472b6', '#34d399']

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })
}

function slotToTime(weekStart: Date, dayIndex: number, slotIndex: number): string {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + dayIndex)
  const totalMinutes = START_HOUR * 60 + slotIndex * SLOT_MINUTES
  d.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0)
  return d.toISOString()
}

function timeToSlot(iso: string): { dayIndex: number; slotIndex: number } | null {
  const d = new Date(iso)
  const dayIndex = (d.getDay() + 6) % 7 // Mon=0
  const minutes = d.getHours() * 60 + d.getMinutes() - START_HOUR * 60
  if (minutes < 0) return null
  const slotIndex = Math.floor(minutes / SLOT_MINUTES)
  if (slotIndex >= TOTAL_SLOTS) return null
  return { dayIndex, slotIndex }
}

function eventDurationSlots(ev: CalEvent): number {
  const start = new Date(ev.start.dateTime).getTime()
  const end = new Date(ev.end.dateTime).getTime()
  return Math.max(1, Math.round((end - start) / (SLOT_MINUTES * 60_000)))
}

interface DropTarget {
  dayIndex: number
  slotIndex: number
}

interface Props {
  weekStart: Date
  events: CalEvent[]
  onDrop: (target: DropTarget) => void
  draggedTask: { id: string; label: string } | null
}

export function WeeklyCalendar({ weekStart, events, onDrop, draggedTask }: Props) {
  const [hover, setHover] = useState<DropTarget | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const days = getWeekDays(weekStart)
  const today = new Date()

  // Build event placement map: key = `${dayIndex}-${slotIndex}` → event
  const eventMap = new Map<string, { ev: CalEvent; spanSlots: number }>()
  for (const ev of events) {
    const slot = timeToSlot(ev.start.dateTime)
    if (!slot) continue
    const key = `${slot.dayIndex}-${slot.slotIndex}`
    if (!eventMap.has(key)) {
      eventMap.set(key, { ev, spanSlots: eventDurationSlots(ev) })
    }
  }

  const hours: string[] = []
  for (let h = START_HOUR; h < END_HOUR; h++) {
    hours.push(`${String(h).padStart(2, '0')}:00`)
    hours.push('')
  }

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">
      {/* Header row */}
      <div className="grid border-b border-white/[0.06]" style={{ gridTemplateColumns: '44px repeat(7, 1fr)' }}>
        <div />
        {days.map((d, i) => {
          const isToday =
            d.getFullYear() === today.getFullYear() &&
            d.getMonth() === today.getMonth() &&
            d.getDate() === today.getDate()
          return (
            <div key={i} className="py-2 text-center">
              <p className={['text-[10px] uppercase tracking-[0.12em]', i >= 5 ? 'text-white/32' : 'text-white/40'].join(' ')}>
                {DAYS_JA[i]}
              </p>
              <p className={[
                'mt-0.5 text-sm font-semibold',
                isToday ? 'text-[#7dd3fc]' : i >= 5 ? 'text-white/36' : 'text-white/72',
              ].join(' ')}>
                {d.getDate()}
              </p>
            </div>
          )
        })}
      </div>

      {/* Scrollable grid */}
      <div ref={gridRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="grid" style={{ gridTemplateColumns: '44px repeat(7, 1fr)' }}>
          {/* Time labels + slot rows */}
          {Array.from({ length: TOTAL_SLOTS }, (_, slotIndex) => {
            const totalMin = START_HOUR * 60 + slotIndex * SLOT_MINUTES
            const h = Math.floor(totalMin / 60)
            const m = totalMin % 60
            const isHourStart = m === 0

            return (
              <>
                {/* Time label */}
                <div
                  key={`time-${slotIndex}`}
                  className={['flex items-start justify-end pr-2 text-[9px] text-white/24', isHourStart ? 'pt-px' : ''].join(' ')}
                  style={{ height: 28 }}
                >
                  {isHourStart ? `${String(h).padStart(2, '0')}:00` : ''}
                </div>

                {/* 7 day columns for this slot */}
                {Array.from({ length: 7 }, (_, dayIndex) => {
                  const key = `${dayIndex}-${slotIndex}`
                  const placed = eventMap.get(key)
                  const isHovered = hover?.dayIndex === dayIndex && hover?.slotIndex === slotIndex

                  return (
                    <div
                      key={key}
                      className={[
                        'relative border-t border-white/[0.04] transition-colors',
                        isHoverTarget(hover, dayIndex, slotIndex) ? 'bg-[#7dd3fc]/10' : '',
                        isHourStart ? 'border-white/[0.08]' : '',
                      ].join(' ')}
                      style={{ height: 28 }}
                      onDragOver={draggedTask ? (e) => { e.preventDefault(); setHover({ dayIndex, slotIndex }) } : undefined}
                      onDragLeave={draggedTask ? () => setHover(null) : undefined}
                      onDrop={draggedTask ? (e) => { e.preventDefault(); setHover(null); onDrop({ dayIndex, slotIndex }) } : undefined}
                    >
                      {placed && (
                        <div
                          className="absolute inset-x-0 z-10 overflow-hidden rounded px-1 py-px text-[9px] font-medium leading-tight"
                          style={{
                            height: placed.spanSlots * 28,
                            top: 0,
                            backgroundColor: `${COLORS[(placed.ev.colorId ? Number(placed.ev.colorId) : 0) % COLORS.length]}28`,
                            borderLeft: `2px solid ${COLORS[(placed.ev.colorId ? Number(placed.ev.colorId) : 0) % COLORS.length]}88`,
                            color: 'rgba(255,255,255,0.72)',
                          }}
                        >
                          {placed.ev.summary}
                        </div>
                      )}
                      {isHovered && draggedTask && (
                        <div className="absolute inset-0 flex items-center justify-center text-[9px] text-[#7dd3fc]/80 z-20">
                          ここに追加
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function isHoverTarget(hover: DropTarget | null, dayIndex: number, slotIndex: number) {
  return hover?.dayIndex === dayIndex && hover?.slotIndex === slotIndex
}

export function slotToDateTime(weekStart: Date, dayIndex: number, slotIndex: number): string {
  return slotToTime(weekStart, dayIndex, slotIndex)
}
