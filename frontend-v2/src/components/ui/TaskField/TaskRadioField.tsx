import type { TaskFieldItem } from './index'

interface TaskRadioFieldProps {
  item: TaskFieldItem
  value: string
  onChange: (v: string) => void
  isReadOnly?: boolean
  dotColor?: string
}

export const TaskRadioField = ({
  item,
  value,
  onChange,
  isReadOnly,
  dotColor = '#7dd3fc',
}: TaskRadioFieldProps) => {
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
      <div className="flex flex-wrap gap-1 pl-9">
        {(item.field_options?.choices ?? []).map(c => (
          <button
            key={c}
            type="button"
            onClick={() => !isReadOnly && onChange(c)}
            className={[
              'rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors',
              value === c
                ? 'border-[#7dd3fc]/40 bg-[#7dd3fc]/15 text-[#aee5ff]'
                : 'border-white/10 text-white/40 hover:border-white/20',
              isReadOnly ? 'cursor-default' : '',
            ].join(' ')}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  )
}
