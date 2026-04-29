import { useEditor, EditorContent, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  content: string
  onChange: (json: string) => void
  placeholder?: string
}

const ToolBtn = ({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
}) => (
  <button
    type="button"
    title={title}
    onMouseDown={e => { e.preventDefault(); onClick() }}
    className={[
      'flex h-7 min-w-[26px] items-center justify-center rounded px-1 text-xs font-semibold transition-colors select-none',
      active
        ? 'bg-white/20 text-white'
        : 'text-white/60 hover:bg-white/10 hover:text-white/90',
    ].join(' ')}
  >
    {children}
  </button>
)

function BubbleToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const editorState = useEditorState({
    editor,
    selector: (ctx) => ({
      isBold: ctx.editor?.isActive('bold'),
      isItalic: ctx.editor?.isActive('italic'),
      isUnderline: ctx.editor?.isActive('underline'),
      isStrike: ctx.editor?.isActive('strike'),
      isCode: ctx.editor?.isActive('code'),
      isLink: ctx.editor?.isActive('link'),
      isH1: ctx.editor?.isActive('heading', { level: 1 }),
      isH2: ctx.editor?.isActive('heading', { level: 2 }),
      isH3: ctx.editor?.isActive('heading', { level: 3 }),
    }),
  })

  useEffect(() => {
    if (!editor) return
    const update = () => {
      const { from, to } = editor.state.selection
      if (from === to) { setPos(null); return }

      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) { setPos(null); return }
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      if (!rect.width) { setPos(null); return }

      const toolbarH = 44
      const toolbarW = ref.current?.offsetWidth ?? 320
      const margin = 8

      let top = rect.top + window.scrollY - toolbarH - margin
      let left = rect.left + window.scrollX + (rect.width - toolbarW) / 2
      if (top < window.scrollY + 8) top = rect.bottom + window.scrollY + margin
      left = Math.max(8, Math.min(left, window.innerWidth - toolbarW - 8))
      setPos({ top, left })
    }

    editor.on('selectionUpdate', update)
    editor.on('transaction', update)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction', update)
    }
  }, [editor])

  if (!pos || !editor) return null

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('URL', prev ?? '')
    if (url === null) return
    if (url === '') { editor.chain().focus().unsetLink().run(); return }
    editor.chain().focus().setLink({ href: url }).run()
  }

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 flex items-center gap-0.5 rounded-xl border border-white/[0.14] bg-[#0d1825]/96 px-2 py-1.5 shadow-2xl backdrop-blur-xl"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={e => e.preventDefault()}
    >
      <ToolBtn active={editorState?.isH1} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="見出し1">H1</ToolBtn>
      <ToolBtn active={editorState?.isH2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="見出し2">H2</ToolBtn>
      <ToolBtn active={editorState?.isH3} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="見出し3">H3</ToolBtn>
      <span className="mx-1 h-4 w-px bg-white/[0.14]" />
      <ToolBtn active={editorState?.isBold} onClick={() => editor.chain().focus().toggleBold().run()} title="太字"><strong>B</strong></ToolBtn>
      <ToolBtn active={editorState?.isItalic} onClick={() => editor.chain().focus().toggleItalic().run()} title="斜体"><em>I</em></ToolBtn>
      <ToolBtn active={editorState?.isUnderline} onClick={() => editor.chain().focus().toggleUnderline().run()} title="下線"><span className="underline">U</span></ToolBtn>
      <ToolBtn active={editorState?.isStrike} onClick={() => editor.chain().focus().toggleStrike().run()} title="取り消し線"><span className="line-through">S</span></ToolBtn>
      <ToolBtn active={editorState?.isCode} onClick={() => editor.chain().focus().toggleCode().run()} title="コード">{'<>'}</ToolBtn>
      <ToolBtn active={editorState?.isLink} onClick={setLink} title="リンク">🔗</ToolBtn>
    </div>,
    document.body
  )
}

export function TiptapEditor({ content, onChange, placeholder = 'ここに書き殴ってください...' }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder, emptyEditorClass: 'is-editor-empty' }),
    ],
    content: (() => {
      if (!content) return ''
      try { return JSON.parse(content) as object }
      catch { return content }
    })(),
    onUpdate: ({ editor }) => {
      onChange(JSON.stringify(editor.getJSON()))
    },
    editorProps: {
      attributes: { class: 'tiptap outline-none' },
    },
  })

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const parsed = (() => {
      if (!content) return null
      try { return JSON.parse(content) as object }
      catch { return null }
    })()
    const current = JSON.stringify(editor.getJSON())
    if (parsed && JSON.stringify(parsed) !== current) {
      editor.commands.setContent(parsed)
    }
    if (!content) editor.commands.clearContent()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  return (
    <div className="relative flex-1">
      <BubbleToolbar editor={editor} />
      <EditorContent editor={editor} className="px-6 py-4" />
    </div>
  )
}
