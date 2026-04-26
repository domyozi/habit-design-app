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

// Element index to position in CORE grid
const ELEMENT_IN_CORE: Record<string, number> = {
  '3,4': 0, '3,5': 1, '4,5': 2, '5,5': 3,
  '5,4': 4, '5,3': 5, '4,3': 6, '3,3': 7,
}

// Sub-grid block (blockRow, blockCol) to element index (null = CORE)
const BLOCK_TO_ELEM: (number | null)[][] = [
  [7, 0, 1],
  [6, null, 2],
  [5, 4, 3],
]

// Local (row%3, col%3) to action index; null = center
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

  // CORE area (rows 3-5, cols 3-5)
  if (row >= 3 && row <= 5 && col >= 3 && col <= 5) {
    const key = `${row},${col}`
    const elemIdx = ELEMENT_IN_CORE[key]
    if (elemIdx !== undefined) return { type: 'element-center', elementIndex: elemIdx, actionIndex: -1 }
  }

  const blockRow = Math.floor(row / 3)
  const blockCol = Math.floor(col / 3)
  const elemIdx = BLOCK_TO_ELEM[blockRow][blockCol]
  if (elemIdx === null) return { type: 'main-goal', elementIndex: -1, actionIndex: -1 } // fallback

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

interface MandalaGridProps {
  data: MandalaData
  onUpdate: (updated: MandalaData) => void
}

export const MandalaGrid = ({ data, onUpdate }: MandalaGridProps) => {
  const [editing, setEditing] = useState<EditTarget>(null)
  const [editText, setEditText] = useState('')
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

  const isEditing = (info: CellInfo): boolean => {
    if (!editing) return false
    if (editing.type === 'main-goal' && info.type === 'main-goal') return true
    if (editing.type === 'element-title' && info.type === 'element-center' && 'elementIndex' in editing && editing.elementIndex === info.elementIndex) return true
    if (editing.type === 'action' && info.type === 'action' && 'elementIndex' in editing && editing.elementIndex === info.elementIndex && editing.actionIndex === info.actionIndex) return true
    return false
  }

  return (
    <div className="overflow-x-auto rounded-2xl">
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
          const elemColor = info.elementIndex >= 0 ? ELEMENT_COLORS[info.elementIndex] : null

          // Add separator lines between the 3×3 blocks
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
            borderColor: isMain
              ? 'rgba(245,196,107,0.45)'
              : isElemCenter && elemColor
                ? elemColor.border
                : 'rgba(255,255,255,0.06)',
          }

          return (
            <div
              key={i}
              style={cellStyle}
              className={[
                'relative flex min-h-[60px] cursor-pointer items-center justify-center border p-1 text-center transition-all duration-150 hover:brightness-125',
                isMain ? 'border-2' : '',
              ].join(' ')}
              onClick={() => !isCell && startEdit(info, content)}
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
                    'text-center leading-tight break-words whitespace-pre-wrap',
                    isMain
                      ? 'text-xs font-bold text-[#f5c46b]'
                      : isElemCenter
                        ? 'text-[11px] font-semibold'
                        : 'text-[10px] text-white/65',
                  ].join(' ')}
                  style={isElemCenter && elemColor ? { color: elemColor.accent } : undefined}
                >
                  {content || (
                    <span className="text-white/18">—</span>
                  )}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[10px] text-white/28 text-right">各セルをクリックして編集できます</p>
    </div>
  )
}
