import { useState } from 'react'
import { generateTaskFeedback } from '@/lib/ai'
import type { TaskFieldItem } from './index'
import { AiMark } from '@/components/ui/AiMark'

interface TaskTextAIFieldProps {
  item: TaskFieldItem
  value: string
  onChange: (v: string) => void
  aiFeedback?: string
  onAIFeedback?: (feedback: string) => void
  isReadOnly?: boolean
  dotColor?: string
}

export const TaskTextAIField = ({
  item,
  value,
  onChange,
  aiFeedback,
  onAIFeedback,
  isReadOnly,
  dotColor = '#7dd3fc',
}: TaskTextAIFieldProps) => {
  const [loading, setLoading] = useState(false)
  const isDone = Boolean(value)

  const handleAI = async () => {
    if (!value.trim() || loading) return
    setLoading(true)
    const fb = await generateTaskFeedback(item.label, value).catch(() => null)
    if (fb) onAIFeedback?.(fb)
    setLoading(false)
  }

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
      <div className="pl-9 flex flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            rows={2}
            disabled={isReadOnly}
            placeholder={item.field_options?.placeholder ?? '記録…'}
            className="flex-1 resize-none rounded-xl border border-white/[0.08] bg-[#0b1320] px-2 py-1.5 text-sm text-white/82 placeholder-white/20 focus:border-white/20 focus:outline-none disabled:opacity-50"
          />
          {value.trim() && !isReadOnly && (
            <button
              type="button"
              onClick={handleAI}
              disabled={loading}
              className="flex flex-shrink-0 items-center gap-1 rounded-full border border-[#7dd3fc]/30 bg-[#7dd3fc]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#aee5ff] disabled:opacity-40"
            >
              <AiMark size={9} />
              {loading ? '...' : 'AI分析'}
            </button>
          )}
        </div>
        {aiFeedback && (
          <p className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[11px] text-white/60">
            {aiFeedback}
          </p>
        )}
      </div>
    </div>
  )
}
