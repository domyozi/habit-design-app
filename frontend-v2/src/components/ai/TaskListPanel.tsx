import { useState, useEffect, useRef } from 'react'
import type { TodoDefinition, HabitCategory } from '@/lib/todos'
import { HABIT_CATEGORIES } from '@/lib/todos'

interface TaskListPanelProps {
  todoDefinitions: TodoDefinition[]
  morningChecked: string[]
  eveningChecked: string[]
  onToggle?: (id: string, section: HabitCategory) => void
  className?: string
}

const TaskRow = ({
  task,
  done,
  accent,
  onToggle,
}: {
  task: TodoDefinition
  done: boolean
  accent: string
  onToggle: () => void
}) => {
  const prevDone = useRef(done)
  const [justChecked, setJustChecked] = useState(false)

  useEffect(() => {
    if (!prevDone.current && done) {
      const t = setTimeout(() => {
        setJustChecked(true)
        setTimeout(() => setJustChecked(false), 700)
      }, 0)
      prevDone.current = done
      return () => clearTimeout(t)
    }
    prevDone.current = done
  }, [done])

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2.5 rounded-xl border border-white/[0.04] bg-white/[0.015] px-2.5 py-2 text-left transition-all duration-300 hover:border-white/[0.08] hover:bg-white/[0.03] active:scale-[0.98]"
      style={justChecked ? { animation: 'row-glow 0.7s ease-out forwards' } : undefined}
    >
      <span
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-all duration-200"
        style={{
          borderColor: done ? `${accent}60` : 'rgba(255,255,255,0.12)',
          backgroundColor: done ? `${accent}18` : 'transparent',
        }}
      >
        {done && (
          <svg viewBox="0 0 10 10" className="h-2 w-2" fill="none"
            style={{ animation: 'check-pop 0.25s ease-out' }}>
            <path d="M2 5l2.5 2.5L8 3" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className={['text-xs leading-snug transition-all duration-300', done ? 'text-white/28 line-through' : 'text-white/72'].join(' ')}>
        {task.label}
      </span>
      {task.minutes && !done && (
        <span className="ml-auto shrink-0 text-[10px] text-white/24">{task.minutes}m</span>
      )}
    </button>
  )
}

const SECTION_ACCENT: Record<HabitCategory, string> = {
  habit: '#ff6b35',
}

export const TaskListPanel = ({
  todoDefinitions,
  morningChecked,
  eveningChecked,
  onToggle,
  className = '',
}: TaskListPanelProps) => {
  const activeTodos = todoDefinitions.filter(t => t.is_active)
  const checkedSet = new Set([...morningChecked, ...eveningChecked])
  const doneCount = activeTodos.filter(t => checkedSet.has(t.id)).length

  return (
    <aside className={`rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(9,16,27,0.98),rgba(7,12,21,0.96))] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.28)] ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold tracking-[0.12em] text-[#8da4c3]">Task list</p>
        <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold text-white/45">
          {doneCount}/{activeTodos.length}
        </span>
      </div>

      <div className="mt-4 space-y-4">
        {HABIT_CATEGORIES.map(cat => {
          const items = activeTodos.filter(t => t.section === cat.id)
          if (items.length === 0) return null
          const accent = SECTION_ACCENT[cat.id]
          const sectionDone = items.filter(t => checkedSet.has(t.id)).length

          return (
            <div key={cat.id}>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: accent }}
                />
                <p className="text-[10px] font-semibold tracking-[0.12em] text-white/35">
                  {cat.label} — {cat.desc}
                </p>
                <span className="ml-auto text-[10px] text-white/28">
                  {sectionDone}/{items.length}
                </span>
              </div>
              <div className="space-y-1">
                {items.map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    done={checkedSet.has(task.id)}
                    accent={accent}
                    onToggle={() => onToggle?.(task.id, task.section as HabitCategory)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
