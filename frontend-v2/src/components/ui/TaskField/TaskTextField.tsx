import type { TaskFieldItem } from './index'

interface TaskTextFieldProps {
  item: TaskFieldItem
  value: string
  onChange: (v: string) => void
  isReadOnly?: boolean
  dotColor?: string
}

export const TaskTextField = ({
  item,
  value,
  onChange,
  isReadOnly,
  dotColor = '#7dd3fc',
}: TaskTextFieldProps) => {
  const isDone = Boolean(value)

  return (
    <div className="flex flex-col gap-2 border-t border-white/[0.05] px-4 py-3">
      <div className="flex items-center gap-3">
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
      </div>
      <div className="pl-9">
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={2}
          disabled={isReadOnly}
          placeholder={item.field_options?.placeholder ?? '記録…'}
          className="w-full resize-none rounded-xl border border-white/[0.08] bg-[#0b1320] px-2 py-1.5 text-sm text-white/82 placeholder-white/20 focus:border-white/20 focus:outline-none disabled:opacity-50"
        />
      </div>
    </div>
  )
}
