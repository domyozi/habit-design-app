import { useState, useRef, useEffect } from 'react'
import type { MandalaData } from '@/lib/ai'

const ELEMENT_COLORS = [
  { accent: '#7dd3fc', bg: 'rgba(125,211,252,0.07)', border: 'rgba(125,211,252,0.28)' },
  { accent: '#a78bfa', bg: 'rgba(167,139,250,0.07)', border: 'rgba(167,139,250,0.28)' },
  { accent: '#34d399', bg: 'rgba(52,211,153,0.07)',  border: 'rgba(52,211,153,0.28)'  },
  { accent: '#f59e0b', bg: 'rgba(245,158,11,0.07)',  border: 'rgba(245,158,11,0.28)'  },
  { accent: '#f87171', bg: 'rgba(248,113,113,0.07)', border: 'rgba(248,113,113,0.28)' },
  { accent: '#fb923c', bg: 'rgba(251,146,60,0.07)',  border: 'rgba(251,146,60,0.28)'  },
  { accent: '#c084fc', bg: 'rgba(192,132,252,0.07)', border: 'rgba(192,132,252,0.28)' },
  { accent: '#86efac', bg: 'rgba(134,239,172,0.07)', border: 'rgba(134,239,172,0.28)' },
]

const ELEMENT_IN_CORE: Record<string, number> = {
  '3,4': 0, '3,5': 1, '4,5': 2, '5,5': 3,
  '5,4': 4, '5,3': 5, '4,3': 6, '3,3': 7,
}

const BLOCK_TO_ELEM: (number | null)[][] = [
  [7, 0, 1],
  [6, null, 2],
  [5, 4, 3],
]

const LOCAL_TO_ACTION: (number | null)[][] = [
  [0, 1, 2],
  [7, null, 3],
  [6, 5, 4],
]

type CellType = 'main-goal' | 'element-center' | 'action'

interface CellInfo {
  type: CellType
  elementIndex: number
  actionIndex: number
}

function getCellInfo(row: number, col: number): CellInfo {
  if (row === 4 && col === 4) return { type: 'main-goal', elementIndex: -1, actionIndex: -1 }

  if (row >= 3 && row <= 5 && col >= 3 && col <= 5) {
    const key = `${row},${col}`
    const elemIdx = ELEMENT_IN_CORE[key]
    if (elemIdx !== undefined) return { type: 'element-center', elementIndex: elemIdx, actionIndex: -1 }
  }

  const blockRow = Math.floor(row / 3)
  const blockCol = Math.floor(col / 3)
  const elemIdx = BLOCK_TO_ELEM[blockRow][blockCol]
  if (elemIdx === null) return { type: 'main-goal', elementIndex: -1, actionIndex: -1 }

  const localRow = row % 3
  const localCol = col % 3
  const actionIdx = LOCAL_TO_ACTION[localRow][localCol]

  if (actionIdx === null) return { type: 'element-center', elementIndex: elemIdx, actionIndex: -1 }
  return { type: 'action', elementIndex: elemIdx, actionIndex: actionIdx }
}

type EditTarget =
  | { type: 'main-goal' }
  | { type: 'element-title'; elementIndex: number }
  | { type: 'action'; elementIndex: number; actionIndex: number }
  | null

interface ActionDetailPanelProps {
  elementTitle: string
  action: string
  isTracked: boolean
  isChecked: boolean
  accentColor: string
  onToggleTracked: () => void
  onToggleChecked: () => void
  onEdit: (newText: string) => void
  onClose: () => void
}

const ActionDetailPanel = ({
  elementTitle,
  action,
  isTracked,
  isChecked,
  accentColor,
  onToggleTracked,
  onToggleChecked,
  onEdit,
  onClose,
}: ActionDetailPanelProps) => {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(action)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const saveEdit = () => {
    const trimmed = editText.trim()
    if (trimmed && trimmed !== action) onEdit(trimmed)
    setEditing(false)
  }

  return (
    <div className="mt-3 rounded-[20px] border border-white/[0.08] bg-[#0b1623]/95 p-4 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: accentColor }}>
          {elementTitle}
        </p>
        <button type="button" onClick={onClose} className="shrink-0 text-white/30 hover:text-white/70 text-sm">✕</button>
      </div>

      {editing ? (
        <div className="mt-3">
          <textarea
            ref={inputRef}
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
            rows={3}
            className="w-full resize-none rounded-xl border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-sm text-white/90 outline-none focus:border-white/[0.24]"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={saveEdit}
              className="rounded-full border border-white/[0.14] bg-white/[0.06] px-4 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/[0.1]"
            >
              保存
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setEditText(action) }}
              className="text-xs text-white/36 hover:text-white/60"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-white/80">{action}</p>
      )}

      {!editing && (
        <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-3">
          <button
            type="button"
            onClick={onToggleTracked}
            className={[
              'flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition-colors',
              isTracked
                ? 'border-[#f59e0b]/30 bg-[#f59e0b]/10 text-[#fbbf24]'
                : 'border-white/[0.06] bg-white/[0.02] text-white/50 hover:bg-white/[0.05]',
            ].join(' ')}
          >
            <span className="flex items-center gap-2">
              <span>📍</span>
              <span>トラッキング対象</span>
            </span>
            <span className={[
              'h-4 w-8 rounded-full border transition-colors relative',
              isTracked ? 'border-[#f59e0b]/60 bg-[#f59e0b]/30' : 'border-white/20 bg-white/[0.04]',
            ].join(' ')}>
              <span className={[
                'absolute top-0.5 h-3 w-3 rounded-full transition-all',
                isTracked ? 'left-4 bg-[#f59e0b]' : 'left-0.5 bg-white/30',
              ].join(' ')} />
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleChecked}
            className={[
              'flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition-colors',
              isChecked
                ? 'border-[#7dd3fc]/30 bg-[#7dd3fc]/10 text-[#7dd3fc]'
                : 'border-white/[0.06] bg-white/[0.02] text-white/50 hover:bg-white/[0.05]',
            ].join(' ')}
          >
            <span className="flex items-center gap-2">
              <span>✓</span>
              <span>今日の完了チェック</span>
            </span>
            <span className={[
              'h-4 w-8 rounded-full border transition-colors relative',
              isChecked ? 'border-[#7dd3fc]/60 bg-[#7dd3fc]/30' : 'border-white/20 bg-white/[0.04]',
            ].join(' ')}>
              <span className={[
                'absolute top-0.5 h-3 w-3 rounded-full transition-all',
                isChecked ? 'left-4 bg-[#7dd3fc]' : 'left-0.5 bg-white/30',
              ].join(' ')} />
            </span>
          </button>

          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex w-full items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-sm text-white/50 hover:bg-white/[0.05]"
          >
            <span>✏</span>
            <span>テキストを編集</span>
          </button>
        </div>
      )}
    </div>
  )
}

interface MandalaGridProps {
  data: MandalaData
  onUpdate: (updated: MandalaData) => void
  checkedActions?: Record<string, boolean>
  onToggleAction?: (elementIdx: number, actionIdx: number) => void
  onSelectAction?: (elementIdx: number, actionIdx: number) => void
  selectedAction?: string | null
  trackedActions?: Record<string, boolean>
  onToggleTracked?: (elementIdx: number, actionIdx: number) => void
}

export const MandalaGrid = ({
  data,
  onUpdate,
  checkedActions,
  onToggleAction,
  onSelectAction,
  selectedAction,
  trackedActions,
  onToggleTracked,
}: MandalaGridProps) => {
  const [editing, setEditing] = useState<EditTarget>(null)
  const [editText, setEditText] = useState('')
  const [detailAction, setDetailAction] = useState<{ elementIdx: number; actionIdx: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const getContent = (info: CellInfo): string => {
    if (info.type === 'main-goal') return data.mainGoal
    const el = data.elements[info.elementIndex]
    if (!el) return ''
    if (info.type === 'element-center') return el.title
    return el.actions[info.actionIndex] ?? ''
  }

  const startEdit = (info: CellInfo, current: string) => {
    if (info.type === 'main-goal') setEditing({ type: 'main-goal' })
    else if (info.type === 'element-center') setEditing({ type: 'element-title', elementIndex: info.elementIndex })
    else setEditing({ type: 'action', elementIndex: info.elementIndex, actionIndex: info.actionIndex })
    setEditText(current)
  }

  const saveEdit = () => {
    if (!editing) return
    const text = editText.trim()
    if (editing.type === 'main-goal') {
      onUpdate({ ...data, mainGoal: text || data.mainGoal, updatedAt: new Date().toISOString() })
    } else if (editing.type === 'element-title') {
      const elements = data.elements.map((el, i) =>
        i === editing.elementIndex ? { ...el, title: text || el.title } : el
      )
      onUpdate({ ...data, elements, updatedAt: new Date().toISOString() })
    } else {
      const elements = data.elements.map((el, i) => {
        if (i !== editing.elementIndex) return el
        const actions = [...el.actions]
        actions[editing.actionIndex] = text || actions[editing.actionIndex]
        return { ...el, actions }
      })
      onUpdate({ ...data, elements, updatedAt: new Date().toISOString() })
    }
    setEditing(null)
  }

  const saveActionEdit = (elementIdx: number, actionIdx: number, newText: string) => {
    const elements = data.elements.map((el, i) => {
      if (i !== elementIdx) return el
      const actions = [...el.actions]
      actions[actionIdx] = newText
      return { ...el, actions }
    })
    onUpdate({ ...data, elements, updatedAt: new Date().toISOString() })
  }

  const isEditing = (info: CellInfo): boolean => {
    if (!editing) return false
    if (editing.type === 'main-goal' && info.type === 'main-goal') return true
    if (editing.type === 'element-title' && info.type === 'element-center' && 'elementIndex' in editing && editing.elementIndex === info.elementIndex) return true
    if (editing.type === 'action' && info.type === 'action' && 'elementIndex' in editing && editing.elementIndex === info.elementIndex && editing.actionIndex === info.actionIndex) return true
    return false
  }

  const detailKey = detailAction ? `${detailAction.elementIdx}-${detailAction.actionIdx}` : null

  return (
    <div className="overflow-x-auto rounded-2xl mandala-print-area">
      <div
        className="grid gap-[2px]"
        style={{ gridTemplateColumns: 'repeat(9, minmax(68px, 1fr))', minWidth: '630px' }}
      >
        {Array.from({ length: 81 }).map((_, i) => {
          const row = Math.floor(i / 9)
          const col = i % 9
          const info = getCellInfo(row, col)
          const content = getContent(info)
          const isCell = isEditing(info)

          const isMain = info.type === 'main-goal'
          const isElemCenter = info.type === 'element-center'
          const isAction = info.type === 'action'
          const elemColor = info.elementIndex >= 0 ? ELEMENT_COLORS[info.elementIndex] : null

          const actionKey = isAction ? `${info.elementIndex}-${info.actionIndex}` : null
          const isChecked = actionKey ? (checkedActions?.[actionKey] ?? false) : false
          const isSelected = actionKey !== null && actionKey === selectedAction
          const isTracked = actionKey ? (trackedActions?.[actionKey] ?? false) : false
          const isDetailOpen = actionKey !== null && actionKey === detailKey

          const borderRight = (col === 2 || col === 5) ? '2px solid rgba(255,255,255,0.08)' : undefined
          const borderBottom = (row === 2 || row === 5) ? '2px solid rgba(255,255,255,0.08)' : undefined

          const cellStyle: React.CSSProperties = {
            borderRight,
            borderBottom,
            backgroundColor: isMain
              ? 'rgba(245,196,107,0.10)'
              : isElemCenter && elemColor
                ? elemColor.bg
                : elemColor
                  ? `${elemColor.bg.replace('0.07', '0.03')}`
                  : 'rgba(255,255,255,0.015)',
            borderColor: isDetailOpen
              ? (elemColor?.accent ?? 'rgba(125,211,252,0.8)')
              : isSelected
                ? (elemColor?.accent ?? 'rgba(125,211,252,0.8)')
                : isMain
                  ? 'rgba(245,196,107,0.45)'
                  : isElemCenter && elemColor
                    ? elemColor.border
                    : 'rgba(255,255,255,0.06)',
          }

          // Action cells: show truncated "title"
          const displayText = isAction && content.length > 13 ? content.slice(0, 12) + '…' : content

          const handleCellClick = () => {
            if (isCell) return
            if (isAction) {
              // Toggle detail panel
              if (isDetailOpen) {
                setDetailAction(null)
              } else {
                setDetailAction({ elementIdx: info.elementIndex, actionIdx: info.actionIndex })
              }
            } else {
              startEdit(info, content)
            }
          }

          return (
            <div
              key={i}
              style={cellStyle}
              className={[
                'relative flex min-h-[60px] cursor-pointer items-center justify-center border p-1 text-center transition-all duration-150 hover:brightness-125',
                isMain ? 'border-2' : '',
                isDetailOpen || isSelected ? 'border-2 brightness-125' : '',
                isChecked ? 'opacity-50' : '',
              ].join(' ')}
              onClick={handleCellClick}
            >
              {isCell ? (
                <input
                  ref={inputRef}
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveEdit()
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  onBlur={saveEdit}
                  className="w-full bg-transparent text-center text-xs text-white outline-none"
                  style={{ minWidth: 0 }}
                />
              ) : (
                <span
                  className={[
                    'text-center leading-tight break-words whitespace-pre-wrap flex-1',
                    isMain
                      ? 'text-xs font-bold text-[#f5c46b]'
                      : isElemCenter
                        ? 'text-[11px] font-semibold'
                        : isChecked
                          ? 'text-[10px] text-white/30 line-through'
                          : 'text-[10px] text-white/65',
                  ].join(' ')}
                  style={isElemCenter && elemColor ? { color: elemColor.accent } : undefined}
                >
                  {displayText || (
                    <span className="text-white/18">—</span>
                  )}
                </span>
              )}

              {/* Tracked indicator */}
              {isTracked && !isCell && (
                <span className="absolute right-0.5 top-0.5 text-[8px] leading-none">📍</span>
              )}

              {/* Action cell buttons: AI select + check */}
              {isAction && !isCell && (
                <div className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5">
                  {onSelectAction && (
                    <button
                      type="button"
                      title="AI案を出す"
                      onClick={e => {
                        e.stopPropagation()
                        onSelectAction(info.elementIndex, info.actionIndex)
                      }}
                      className={[
                        'flex h-4 w-4 items-center justify-center rounded text-[8px] transition-all',
                        isSelected
                          ? 'bg-[#7dd3fc]/30 text-[#7dd3fc]'
                          : 'text-white/20 hover:text-white/60',
                      ].join(' ')}
                    >
                      ✦
                    </button>
                  )}
                  {onToggleAction && (
                    <button
                      type="button"
                      title="完了"
                      onClick={e => {
                        e.stopPropagation()
                        onToggleAction(info.elementIndex, info.actionIndex)
                      }}
                      className={[
                        'flex h-4 w-4 items-center justify-center rounded border transition-all',
                        isChecked
                          ? 'border-[#7dd3fc] bg-[#7dd3fc] text-black'
                          : 'border-white/20 text-white/0 hover:border-white/50',
                      ].join(' ')}
                    >
                      {isChecked && (
                        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Action detail panel */}
      {detailAction && (() => {
        const el = data.elements[detailAction.elementIdx]
        const actionText = el?.actions[detailAction.actionIdx] ?? ''
        const key = `${detailAction.elementIdx}-${detailAction.actionIdx}`
        const color = ELEMENT_COLORS[detailAction.elementIdx]
        return (
          <ActionDetailPanel
            elementTitle={el?.title ?? ''}
            action={actionText}
            isTracked={trackedActions?.[key] ?? false}
            isChecked={checkedActions?.[key] ?? false}
            accentColor={color?.accent ?? '#7dd3fc'}
            onToggleTracked={() => onToggleTracked?.(detailAction.elementIdx, detailAction.actionIdx)}
            onToggleChecked={() => onToggleAction?.(detailAction.elementIdx, detailAction.actionIdx)}
            onEdit={newText => saveActionEdit(detailAction.elementIdx, detailAction.actionIdx, newText)}
            onClose={() => setDetailAction(null)}
          />
        )
      })()}

      <p className="print-hide mt-2 text-right text-[10px] text-white/28">セルをクリックで詳細 · ✦でAI提案 · □で完了チェック</p>
    </div>
  )
}
