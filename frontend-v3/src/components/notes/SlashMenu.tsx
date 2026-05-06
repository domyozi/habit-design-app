import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'

interface Command {
  id: string
  label: string
  hint: string
  icon: string
  action: (editor: Editor) => void
}

const COMMANDS: Command[] = [
  { id: 'h1', label: 'Heading 1', hint: '大見出し', icon: 'H1', action: (e) => e.chain().focus().deleteRange(e.state.selection).toggleHeading({ level: 1 }).run() },
  { id: 'h2', label: 'Heading 2', hint: '中見出し', icon: 'H2', action: (e) => e.chain().focus().deleteRange(e.state.selection).toggleHeading({ level: 2 }).run() },
  { id: 'bullet', label: 'Bullets', hint: '箇条書き', icon: '•', action: (e) => e.chain().focus().deleteRange(e.state.selection).toggleBulletList().run() },
  { id: 'ordered', label: 'Numbers', hint: '番号付き', icon: '1.', action: (e) => e.chain().focus().deleteRange(e.state.selection).toggleOrderedList().run() },
  { id: 'task', label: 'Tasks', hint: 'チェックリスト', icon: '☑', action: (e) => e.chain().focus().deleteRange(e.state.selection).toggleTaskList().run() },
  { id: 'quote', label: 'Quote', hint: '引用', icon: '❝', action: (e) => e.chain().focus().deleteRange(e.state.selection).toggleBlockquote().run() },
  { id: 'code', label: 'Code', hint: 'コードブロック', icon: '</>', action: (e) => e.chain().focus().deleteRange(e.state.selection).toggleCodeBlock().run() },
  { id: 'rule', label: 'Divider', hint: '区切り線', icon: '—', action: (e) => e.chain().focus().deleteRange(e.state.selection).setHorizontalRule().run() },
]

interface Props {
  editor: Editor
  query: string
  pos: { top: number; left: number }
  onClose: () => void
  onImageInsert: () => void
  onCopyBlockLink: () => void
}

export function SlashMenu({ editor, query, pos, onClose, onImageInsert, onCopyBlockLink }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const commands: Command[] = [
    ...COMMANDS,
    { id: 'image', label: 'Image', hint: '画像を挿入', icon: '▧', action: () => { onClose(); onImageInsert() } },
    { id: 'anchor', label: 'Copy link', hint: 'ブロックリンク', icon: '🔗', action: (e) => { e.chain().focus().deleteRange(e.state.selection).run(); onCopyBlockLink() } },
  ]
  const filtered = commands.filter((command) => {
    const q = query.trim().toLowerCase()
    return !q || command.label.toLowerCase().includes(q) || command.hint.toLowerCase().includes(q)
  })

  useEffect(() => setActiveIndex(0), [query])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((i) => (i + 1) % filtered.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        filtered[activeIndex]?.action(editor)
        onClose()
      } else if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [activeIndex, editor, filtered, onClose])

  useEffect(() => {
    const item = ref.current?.querySelector(`[data-index="${activeIndex}"]`) as HTMLElement | null
    item?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (filtered.length === 0) return null

  return (
    <div
      ref={ref}
      className="notes-slash-menu"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="notes-slash-title">INSERT</div>
      {filtered.map((command, index) => (
        <button
          key={command.id}
          type="button"
          data-index={index}
          className={index === activeIndex ? 'is-active' : ''}
          onMouseDown={(event) => {
            event.preventDefault()
            command.action(editor)
            onClose()
          }}
        >
          <span>{command.icon}</span>
          <strong>{command.label}</strong>
          <small>{command.hint}</small>
        </button>
      ))}
    </div>
  )
}
