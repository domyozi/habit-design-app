import { useRef, useState, useEffect, useCallback } from 'react'
import type { CalEvent } from '@/hooks/useGoogleCalendar'

const START_HOUR = 6
const END_HOUR = 23
const SLOT_MINUTES = 30
const TOTAL_SLOTS = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES
const SLOT_H = 28

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

function getNowPx(): number | null {
  const now = new Date()
  const minutesFromStart = now.getHours() * 60 + now.getMinutes() - START_HOUR * 60
  if (minutesFromStart < 0 || minutesFromStart > (END_HOUR - START_HOUR) * 60) return null
  return (minutesFromStart / SLOT_MINUTES) * SLOT_H
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

interface DropTarget { dayIndex: number; slotIndex: number }

interface Props {
  rangeStart: Date
  numDays: number
  events: CalEvent[]
  onDrop: (target: DropTarget) => void
  draggedTask: { id: string; label: string } | null
  creatingSlot: string | null
  onEventDragStart: (ev: CalEvent) => void
  onEventDragEnd: () => void
  draggedEvent: CalEvent | null
  updatingEventId: string | null
  onEventResize: (eventId: string, newDurationMinutes: number) => void
  resizingEventId: string | null
}

export function WeeklyCalendar({
  rangeStart, numDays, events, onDrop,
  draggedTask, creatingSlot,
  onEventDragStart, onEventDragEnd, draggedEvent, updatingEventId,
  onEventResize, resizingEventId,
}: Props) {
  const [hover, setHover] = useState<DropTarget | null>(null)
  const [nowPx, setNowPx] = useState<number | null>(getNowPx)
  const gridRef = useRef<HTMLDivElement>(null)
  const resizeRef = useRef<{ eventId: string; startY: number; origSlots: number } | null>(null)

  // Update current time line every minute
  useEffect(() => {
    setNowPx(getNowPx())
    const timer = setInterval(() => setNowPx(getNowPx()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, ev: CalEvent, origSlots: number) => {
    e.preventDefault()
    e.stopPropagation()
    resizeRef.current = { eventId: ev.id, startY: e.clientY, origSlots }
    const onMouseMove = (me: MouseEvent) => {
      if (!resizeRef.current) return
      const deltaSlots = Math.round((me.clientY - resizeRef.current.startY) / SLOT_H)
      const newSlots = Math.max(1, resizeRef.current.origSlots + deltaSlots)
      // Visual preview via CSS var on the event element
      const el = document.getElementById(`cal-ev-${resizeRef.current.eventId}`)
      if (el) el.style.height = `${newSlots * SLOT_H - 2}px`
    }
    const onMouseUp = (me: MouseEvent) => {
      if (!resizeRef.current) return
      const deltaSlots = Math.round((me.clientY - resizeRef.current.startY) / SLOT_H)
      const newSlots = Math.max(1, resizeRef.current.origSlots + deltaSlots)
      onEventResize(resizeRef.current.eventId, newSlots * SLOT_MINUTES)
      resizeRef.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [onEventResize])

  const days = getDays(rangeStart, numDays)
  const today = new Date()
  const todayInRange = days.some(d => isSameDay(d, today))

  const eventMap = new Map<string, { ev: CalEvent; spanSlots: number }>()
  for (const ev of events) {
    const slot = timeToSlot(ev.start.dateTime, rangeStart, numDays)
    if (!slot) continue
    const key = `${slot.dayIndex}-${slot.slotIndex}`
    if (!eventMap.has(key)) {
      eventMap.set(key, { ev, spanSlots: eventDurationSlots(ev) })
    }
  }

  const creatingSlotPos = creatingSlot ? timeToSlot(creatingSlot, rangeStart, numDays) : null
  const isDragging = Boolean(draggedTask || draggedEvent)
  const colWidth = `repeat(${numDays}, 1fr)`

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">
      {/* Header */}
      <div className="grid border-b border-white/[0.06]" style={{ gridTemplateColumns: `44px ${colWidth}` }}>
        <div />
        {days.map((d, i) => {
          const isToday = isSameDay(d, today)
          const dow = d.getDay()
          const isWeekend = dow === 0 || dow === 6
          return (
            <div key={i} className="py-2 text-center">
              <p className={['text-[10px] uppercase tracking-[0.12em]', isWeekend ? 'text-white/32' : 'text-white/40'].join(' ')}>
                {DAYS_JA[dow]}
              </p>
              <p className={['mt-0.5 text-sm font-semibold', isToday ? 'text-[#7dd3fc]' : isWeekend ? 'text-white/36' : 'text-white/72'].join(' ')}>
                {d.getDate()}
              </p>
            </div>
          )
        })}
      </div>

      {/* Scrollable grid */}
      <div ref={gridRef} className="relative flex-1 overflow-y-auto overflow-x-hidden">
        {/* Current time line */}
        {todayInRange && nowPx !== null && (
          <div
            style={{ position: 'absolute', top: nowPx, left: 44, right: 0, zIndex: 30, pointerEvents: 'none' }}
          >
            <div className="flex items-center">
              <div className="h-2 w-2 shrink-0 rounded-full bg-red-400" style={{ marginLeft: -4 }} />
              <div className="flex-1 border-t border-red-400/60" />
            </div>
          </div>
        )}

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
                  style={{ height: SLOT_H }}
                >
                  {isHourStart ? `${String(h).padStart(2, '0')}:00` : ''}
                </div>

                {Array.from({ length: numDays }, (_, dayIndex) => {
                  const key = `${dayIndex}-${slotIndex}`
                  const placed = eventMap.get(key)
                  const isHovered = hover?.dayIndex === dayIndex && hover?.slotIndex === slotIndex
                  const isCreating = creatingSlotPos?.dayIndex === dayIndex && creatingSlotPos?.slotIndex === slotIndex

                  return (
                    <div
                      key={key}
                      className={[
                        'relative border-t border-white/[0.04] transition-colors',
                        isHovered ? 'bg-[#7dd3fc]/10' : '',
                        isHourStart ? 'border-white/[0.08]' : '',
                      ].join(' ')}
                      style={{ height: SLOT_H }}
                      onDragOver={isDragging ? (e) => { e.preventDefault(); setHover({ dayIndex, slotIndex }) } : undefined}
                      onDragLeave={isDragging ? () => setHover(null) : undefined}
                      onDrop={isDragging ? (e) => { e.preventDefault(); setHover(null); onDrop({ dayIndex, slotIndex }) } : undefined}
                    >
                      {placed && (
                        <div
                          id={`cal-ev-${placed.ev.id}`}
                          draggable
                          onDragStart={(e) => { e.stopPropagation(); onEventDragStart(placed.ev) }}
                          onDragEnd={onEventDragEnd}
                          className={[
                            'absolute inset-x-0.5 z-10 overflow-hidden rounded px-1 py-px text-[9px] font-medium leading-tight cursor-grab active:cursor-grabbing active:opacity-60 transition-opacity',
                            (updatingEventId === placed.ev.id || resizingEventId === placed.ev.id) ? 'opacity-40' : '',
                          ].join(' ')}
                          style={{
                            height: Math.max(placed.spanSlots, 1) * SLOT_H - 2,
                            top: 1,
                            backgroundColor: `${COLORS[(placed.ev.colorId ? Number(placed.ev.colorId) : 0) % COLORS.length]}28`,
                            borderLeft: `2px solid ${COLORS[(placed.ev.colorId ? Number(placed.ev.colorId) : 0) % COLORS.length]}88`,
                            color: 'rgba(255,255,255,0.72)',
                          }}
                        >
                          {updatingEventId === placed.ev.id ? (
                            <div className="flex items-center gap-1 mt-1">
                              <div className="h-2 w-2 animate-spin rounded-full border border-white/20 border-t-white/70" />
                              <span className="text-[8px] text-white/50">移動中…</span>
                            </div>
                          ) : resizingEventId === placed.ev.id ? (
                            <div className="flex items-center gap-1 mt-1">
                              <div className="h-2 w-2 animate-spin rounded-full border border-white/20 border-t-white/70" />
                              <span className="text-[8px] text-white/50">変更中…</span>
                            </div>
                          ) : placed.ev.summary}
                          {/* Resize handle */}
                          {resizingEventId !== placed.ev.id && updatingEventId !== placed.ev.id && (
                            <div
                              className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize flex items-center justify-center group"
                              onMouseDown={(e) => handleResizeMouseDown(e, placed.ev, placed.spanSlots)}
                              onDragStart={(e) => e.preventDefault()}
                            >
                              <div className="w-6 h-0.5 rounded-full bg-white/20 group-hover:bg-white/50 transition-colors" />
                            </div>
                          )}
                        </div>
                      )}

                      {isCreating && (
                        <div className="absolute inset-x-0.5 z-20 flex items-center gap-1 rounded bg-[#7dd3fc]/15 px-1" style={{ height: SLOT_H - 2, top: 1 }}>
                          <div className="h-2.5 w-2.5 animate-spin rounded-full border border-[#7dd3fc]/30 border-t-[#7dd3fc]" />
                          <span className="text-[9px] text-[#7dd3fc]/70">登録中…</span>
                        </div>
                      )}

                      {isHovered && isDragging && !isCreating && (
                        <div className="absolute inset-0 flex items-center justify-center text-[9px] text-[#7dd3fc]/80 z-10">
                          ドロップして{draggedEvent ? '移動' : '登録'}
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
