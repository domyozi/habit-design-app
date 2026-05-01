import { useRef, useEffect, useState } from 'react'
import type { TaskFieldItem } from './index'

interface TaskCheckboxFieldProps {
  item: TaskFieldItem
  checked: boolean
  onToggle: () => void
  skipped?: boolean
  onSkip?: () => void
  isReadOnly?: boolean
  dotColor?: string
}

export const TaskCheckboxField = ({
  item,
  checked,
  onToggle,
  skipped = false,
  onSkip,
  isReadOnly = false,
  dotColor = '#7dd3fc',
}: TaskCheckboxFieldProps) => {
  const prevChecked = useRef(checked)
  const [bouncing, setBouncing] = useState(false)

  useEffect(() => {
    if (!prevChecked.current && checked) {
      setBouncing(true)
      const t = setTimeout(() => setBouncing(false), 300)
      prevChecked.current = checked
      return () => clearTimeout(t)
    }
    prevChecked.current = checked
  }, [checked])

  const rowOpacity = checked || skipped ? 'opacity-50' : ''

  return (
    <div className={['group flex w-full items-center border-t border-white/[0.05] transition-all duration-300', rowOpacity].join(' ')}>
      {/* メインボタン（完了トグル） */}
      <button
        type="button"
        onClick={onToggle}
        disabled={isReadOnly}
        data-testid={`check-${item.id}`}
        className="flex flex-1 items-center gap-3 px-4 py-3 text-left"
      >
        <div className="relative flex-shrink-0 flex items-center justify-center w-6 h-6">
          {!checked && !skipped && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2.5 h-1 w-1 rounded-full"
              style={{
                backgroundColor: dotColor,
                animation: 'pulse-dot 1.8s ease-in-out infinite',
              }}
            />
          )}
          <span
            className={[
              'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border transition-all duration-200',
              checked
                ? 'border-[#34d399]/50 bg-[#34d399]/15'
                : skipped
                  ? 'border-white/15 bg-white/[0.02]'
                  : 'border-white/20 bg-white/[0.03]',
            ].join(' ')}
            style={bouncing ? { animation: 'check-bounce 0.3s ease-out' } : undefined}
          >
            {checked && (
              <svg
                className="w-3.5 h-3.5 text-[#34d399]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
                style={{ animation: 'check-pop 0.25s ease-out' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
            {skipped && !checked && (
              <span className="text-[13px] font-medium text-white/25 leading-none">—</span>
            )}
          </span>
        </div>

        <span
          className={[
            'flex-1 text-sm transition-all duration-300',
            checked
              ? 'text-white/28 line-through'
              : skipped
                ? 'text-white/28 italic'
                : 'text-white/82',
          ].join(' ')}
        >
          {item.label}
        </span>

        <div className="flex flex-shrink-0 items-center gap-2">
          {item.isMust && (
            <span className="rounded-full border border-[#7dd3fc]/25 bg-[#7dd3fc]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#aee5ff]">
              MUST
            </span>
          )}
          {item.streak != null && item.streak > 0 && (
            <span className="text-[11px] text-white/32">{item.streak} days</span>
          )}
          {item.monthCount != null && item.monthTarget != null && (
            <span className="text-[11px] font-mono text-white/32">{item.monthCount}/{item.monthTarget}</span>
          )}
          {item.minutes && (
            <span className="text-[11px] text-white/24">{item.minutes}m</span>
          )}
        </div>
      </button>

      {/* スキップボタン（完了済みには表示しない） */}
      {!isReadOnly && !checked && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onSkip?.() }}
          title={skipped ? 'スキップを解除' : 'スキップ（できなかった）'}
          className={[
            'flex-shrink-0 flex items-center justify-center w-8 h-10 mr-1 rounded text-[12px] transition-opacity duration-150',
            skipped
              ? 'opacity-100 text-white/36'
              : 'opacity-0 group-hover:opacity-100 text-white/20 hover:text-white/50',
          ].join(' ')}
        >
          ✗
        </button>
      )}
    </div>
  )
}
