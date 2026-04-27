import type { TaskFieldItem } from './index'

interface TaskPercentFieldProps {
  item: TaskFieldItem
  value: string
  onChange: (v: string) => void
  isReadOnly?: boolean
  dotColor?: string
}

export const TaskPercentField = ({
  item,
  value,
  onChange,
  isReadOnly,
  dotColor = '#7dd3fc',
}: TaskPercentFieldProps) => {
  const isDone = Boolean(value)

  const handleChange = (raw: string) => {
    if (raw === '') { onChange(''); return }
    const n = Number(raw)
    if (isNaN(n)) return
    onChange(String(Math.min(100, Math.max(0, n))))
  }

  return (
    <div className="flex items-center gap-3 border-t border-white/[0.05] px-4 py-3">
      <div className="relative flex-shrink-0 flex items-center justify-center w-6 h-6">
        <span
          className="h-1.5 w-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: dotColor }}
        />
      </div>

      <span
        className={[
          'flex-1 text-sm transition-all duration-300',
          isDone ? 'opacity-50' : 'text-white/82',
        ].join(' ')}
      >
        {item.label}
      </span>

      <div className="flex flex-shrink-0 items-center gap-1.5">
        <input
          type="number"
          value={value}
          onChange={e => handleChange(e.target.value)}
          min={0}
          max={100}
          disabled={isReadOnly}
          className="w-20 rounded border border-white/10 bg-[#0b1320] px-2 py-1 text-center text-sm font-mono text-white/85 disabled:opacity-50"
          placeholder="—"
        />
        <span className="text-xs text-white/40">%</span>
      </div>
    </div>
  )
}
