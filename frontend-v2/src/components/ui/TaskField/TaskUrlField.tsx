import type { TaskFieldItem } from './index'

interface TaskUrlFieldProps {
  item: TaskFieldItem
  value: string
  onChange: (v: string) => void
  isReadOnly?: boolean
  dotColor?: string
}

export const TaskUrlField = ({
  item,
  value,
  onChange,
  isReadOnly,
  dotColor = '#7dd3fc',
}: TaskUrlFieldProps) => {
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
      <div className="pl-9 flex items-center gap-2">
        <input
          type="url"
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={isReadOnly}
          placeholder={item.field_options?.placeholder ?? 'https://'}
          className="flex-1 rounded-xl border border-white/[0.08] bg-[#0b1320] px-2 py-1.5 text-sm text-white/82 placeholder-white/20 focus:border-white/20 focus:outline-none disabled:opacity-50"
        />
        {value && (() => {
          try {
            const u = new URL(value)
            if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
            return (
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-[#7dd3fc]/60 hover:text-[#7dd3fc] flex-shrink-0"
              >
                開く↗
              </a>
            )
          } catch {
            return null
          }
        })()}
      </div>
    </div>
  )
}
