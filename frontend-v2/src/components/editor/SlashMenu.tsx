import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'

interface Command {
  id: string
  label: string
  desc: string
  icon: string
  action: (editor: Editor) => void
}

const COMMANDS: Command[] = [
  {
    id: 'h1', label: '見出し 1', desc: '大きな見出し', icon: 'H1',
    action: e => e.chain().focus().deleteRange(e.state.selection).toggleHeading({ level: 1 }).run(),
  },
  {
    id: 'h2', label: '見出し 2', desc: '中くらいの見出し', icon: 'H2',
    action: e => e.chain().focus().deleteRange(e.state.selection).toggleHeading({ level: 2 }).run(),
  },
  {
    id: 'h3', label: '見出し 3', desc: '小さな見出し', icon: 'H3',
    action: e => e.chain().focus().deleteRange(e.state.selection).toggleHeading({ level: 3 }).run(),
  },
  {
    id: 'bullet', label: '箇条書き', desc: 'シンプルなリスト', icon: '•',
    action: e => e.chain().focus().deleteRange(e.state.selection).toggleBulletList().run(),
  },
  {
    id: 'ordered', label: '番号付きリスト', desc: '順序付きリスト', icon: '1.',
    action: e => e.chain().focus().deleteRange(e.state.selection).toggleOrderedList().run(),
  },
  {
    id: 'task', label: 'チェックリスト', desc: 'タスクリスト', icon: '☑',
    action: e => e.chain().focus().deleteRange(e.state.selection).toggleTaskList().run(),
  },
  {
    id: 'code', label: 'コードブロック', desc: 'コードを記述', icon: '</>',
    action: e => e.chain().focus().deleteRange(e.state.selection).toggleCodeBlock().run(),
  },
  {
    id: 'quote', label: '引用', desc: 'ブロック引用', icon: '❝',
    action: e => e.chain().focus().deleteRange(e.state.selection).toggleBlockquote().run(),
  },
  {
    id: 'hr', label: '区切り線', desc: '横線を挿入', icon: '—',
    action: e => e.chain().focus().deleteRange(e.state.selection).setHorizontalRule().run(),
  },
]

interface Props {
  editor: Editor
  query: string
  pos: { top: number; left: number }
  onClose: () => void
  onImageInsert: () => void
}

export function SlashMenu({ editor, query, pos, onClose, onImageInsert }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const allCommands: Command[] = [
    ...COMMANDS,
    {
      id: 'image', label: '画像', desc: '画像を挿入', icon: '🖼',
      action: () => { onClose(); onImageInsert() },
    },
  ]

  const filtered = query
    ? allCommands.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.desc.toLowerCase().includes(query.toLowerCase())
      )
    : allCommands

  useEffect(() => { setActiveIndex(0) }, [query])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex(i => (i + 1) % filtered.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex(i => (i - 1 + filtered.length) % filtered.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[activeIndex]) {
          filtered[activeIndex].action(editor)
          onClose()
        }
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [filtered, activeIndex, editor, onClose])

  // Scroll active item into view
  useEffect(() => {
    const el = ref.current?.querySelector(`[data-idx="${activeIndex}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (filtered.length === 0) return null

  return (
    <div
      ref={ref}
      className="fixed z-50 w-64 overflow-hidden rounded-xl border border-white/[0.12] bg-[#0d1825]/96 shadow-2xl backdrop-blur-xl"
      style={{ top: pos.top, left: pos.left, maxHeight: 320, overflowY: 'auto' }}
      onMouseDown={e => e.preventDefault()}
    >
      <div className="px-3 py-2 border-b border-white/[0.06]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">ブロックを挿入</p>
      </div>
      {filtered.map((cmd, i) => (
        <button
          key={cmd.id}
          data-idx={i}
          type="button"
          onMouseDown={e => { e.preventDefault(); cmd.action(editor); onClose() }}
          className={[
            'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
            i === activeIndex ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]',
          ].join(' ')}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.04] text-xs font-bold text-white/60">
            {cmd.icon}
          </span>
          <div>
            <p className="text-sm text-white/85">{cmd.label}</p>
            <p className="text-[10px] text-white/36">{cmd.desc}</p>
          </div>
        </button>
      ))}
    </div>
  )
}
