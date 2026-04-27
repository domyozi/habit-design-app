import type { TaskFieldItem } from './index'

interface TaskSelectFieldProps {
  item: TaskFieldItem
  value: string
  onChange: (v: string) => void
  isReadOnly?: boolean
  dotColor?: string
}

export const TaskSelectField = ({
  item,
  value,
  onChange,
  isReadOnly,
  dotColor = '#7dd3fc',
}: TaskSelectFieldProps) => {
  const isDone = Boolean(value)

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

      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={isReadOnly}
        className="rounded border border-white/10 bg-[#0b1320] px-2 py-1 text-sm text-white/85 disabled:opacity-50"
      >
        <option value="">— 選択 —</option>
        {(item.field_options?.choices ?? []).map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  )
}
