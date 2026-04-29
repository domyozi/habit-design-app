import { useRef, useState } from 'react'
import type { CalEvent } from '@/hooks/useGoogleCalendar'

const START_HOUR = 6
const END_HOUR = 23
const SLOT_MINUTES = 30
const TOTAL_SLOTS = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES

const DAYS_JA = ['日', '月', '火', '水', '木', '金', '土']
const COLORS = ['#38bdf8', '#22c55e', '#f59e0b', '#a78bfa', '#ff6b35', '#f472b6', '#34d399']

function getDays(rangeStart: Date, numDays: number): Date[] {
  return Array.from({ length: numDays }, (_, i) => {
    const d = new Date(rangeStart)
    d.setDate(d.getDate() + i)
    return d
  })
}

export function slotToDateTime(rangeStart: Date, dayIndex: number, slotIndex: number): string {
  const d = new Date(rangeStart)
  d.setDate(d.getDate() + dayIndex)
  const totalMinutes = START_HOUR * 60 + slotIndex * SLOT_MINUTES
  d.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0)
  return d.toISOString()
}

function timeToSlot(iso: string, rangeStart: Date, numDays: number): { dayIndex: number; slotIndex: number } | null {
  const d = new Date(iso)
  const rangeEnd = new Date(rangeStart)
  rangeEnd.setDate(rangeEnd.getDate() + numDays)

  if (d < rangeStart || d >= rangeEnd) return null

  const dayIndex = Math.floor((d.getTime() - rangeStart.getTime()) / (24 * 3600_000))
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
  rangeStart: Date
  numDays: number
  events: CalEvent[]
  onDrop: (target: DropTarget) => void
  draggedTask: { id: string; label: string } | null
  creatingSlot: string | null
}

export function WeeklyCalendar({ rangeStart, numDays, events, onDrop, draggedTask, creatingSlot }: Props) {
  const [hover, setHover] = useState<DropTarget | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const days = getDays(rangeStart, numDays)
  const today = new Date()

  const eventMap = new Map<string, { ev: CalEvent; spanSlots: number }>()
  for (const ev of events) {
    const slot = timeToSlot(ev.start.dateTime, rangeStart, numDays)
    if (!slot) continue
    const key = `${slot.dayIndex}-${slot.slotIndex}`
    if (!eventMap.has(key)) {
      eventMap.set(key, { ev, spanSlots: eventDurationSlots(ev) })
    }
  }

  // Find creating slot position
  const creatingSlotPos = creatingSlot ? timeToSlot(creatingSlot, rangeStart, numDays) : null

  const colWidth = `repeat(${numDays}, 1fr)`

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">
      {/* Header */}
      <div className="grid border-b border-white/[0.06]" style={{ gridTemplateColumns: `44px ${colWidth}` }}>
        <div />
        {days.map((d, i) => {
          const isToday =
            d.getFullYear() === today.getFullYear() &&
            d.getMonth() === today.getMonth() &&
            d.getDate() === today.getDate()
          const dow = d.getDay()
          const isWeekend = dow === 0 || dow === 6
          return (
            <div key={i} className="py-2 text-center">
              <p className={['text-[10px] uppercase tracking-[0.12em]', isWeekend ? 'text-white/32' : 'text-white/40'].join(' ')}>
                {DAYS_JA[dow]}
              </p>
              <p className={[
                'mt-0.5 text-sm font-semibold',
                isToday ? 'text-[#7dd3fc]' : isWeekend ? 'text-white/36' : 'text-white/72',
              ].join(' ')}>
                {d.getDate()}
              </p>
            </div>
          )
        })}
      </div>

      {/* Scrollable grid */}
      <div ref={gridRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="grid" style={{ gridTemplateColumns: `44px ${colWidth}` }}>
          {Array.from({ length: TOTAL_SLOTS }, (_, slotIndex) => {
            const totalMin = START_HOUR * 60 + slotIndex * SLOT_MINUTES
            const h = Math.floor(totalMin / 60)
            const m = totalMin % 60
            const isHourStart = m === 0

            return (
              <>
                <div
                  key={`time-${slotIndex}`}
                  className={['flex items-start justify-end pr-2 text-[9px] text-white/24', isHourStart ? 'pt-px' : ''].join(' ')}
                  style={{ height: 28 }}
                >
                  {isHourStart ? `${String(h).padStart(2, '0')}:00` : ''}
                </div>

                {Array.from({ length: numDays }, (_, dayIndex) => {
                  const key = `${dayIndex}-${slotIndex}`
                  const placed = eventMap.get(key)
                  const isHovered = hover?.dayIndex === dayIndex && hover?.slotIndex === slotIndex
                  const isCreating =
                    creatingSlotPos?.dayIndex === dayIndex && creatingSlotPos?.slotIndex === slotIndex

                  return (
                    <div
                      key={key}
                      className={[
                        'relative border-t border-white/[0.04] transition-colors',
                        isHovered ? 'bg-[#7dd3fc]/10' : '',
                        isHourStart ? 'border-white/[0.08]' : '',
                      ].join(' ')}
                      style={{ height: 28 }}
                      onDragOver={draggedTask ? (e) => { e.preventDefault(); setHover({ dayIndex, slotIndex }) } : undefined}
                      onDragLeave={draggedTask ? () => setHover(null) : undefined}
                      onDrop={draggedTask ? (e) => { e.preventDefault(); setHover(null); onDrop({ dayIndex, slotIndex }) } : undefined}
                    >
                      {placed && (
                        <div
                          className="absolute inset-x-0.5 z-10 overflow-hidden rounded px-1 py-px text-[9px] font-medium leading-tight"
                          style={{
                            height: Math.max(placed.spanSlots, 1) * 28 - 2,
                            top: 1,
                            backgroundColor: `${COLORS[(placed.ev.colorId ? Number(placed.ev.colorId) : 0) % COLORS.length]}28`,
                            borderLeft: `2px solid ${COLORS[(placed.ev.colorId ? Number(placed.ev.colorId) : 0) % COLORS.length]}88`,
                            color: 'rgba(255,255,255,0.72)',
                          }}
                        >
                          {placed.ev.summary}
                        </div>
                      )}

                      {isCreating && (
                        <div className="absolute inset-x-0.5 z-20 flex items-center gap-1 rounded bg-[#7dd3fc]/15 px-1" style={{ height: 26, top: 1 }}>
                          <div className="h-2.5 w-2.5 animate-spin rounded-full border border-[#7dd3fc]/30 border-t-[#7dd3fc]" />
                          <span className="text-[9px] text-[#7dd3fc]/70">登録中…</span>
                        </div>
                      )}

                      {isHovered && draggedTask && !isCreating && (
                        <div className="absolute inset-0 flex items-center justify-center text-[9px] text-[#7dd3fc]/80 z-10">
                          ドロップして登録
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
