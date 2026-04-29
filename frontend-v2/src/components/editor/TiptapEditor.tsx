import { useEditor, EditorContent, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import CharacterCount from '@tiptap/extension-character-count'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SlashMenu } from './SlashMenu'

const lowlight = createLowlight(common)

// ─── Image resize helpers ─────────────────────────────────────────────────────

const MAX_IMAGE_WIDTH = 1200
const JPEG_QUALITY = 0.85

async function resizeImageFile(file: File): Promise<string> {
  return new Promise(resolve => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const ratio = Math.min(1, MAX_IMAGE_WIDTH / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * ratio)
      canvas.height = Math.round(img.height * ratio)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
    }
    img.src = url
  })
}

async function resizeImageFromClipboard(item: DataTransferItem): Promise<string | null> {
  if (!item.type.startsWith('image/')) return null
  const file = item.getAsFile()
  if (!file) return null
  return resizeImageFile(file)
}

// ─── Bubble toolbar ───────────────────────────────────────────────────────────

const ToolBtn = ({ active, onClick, children, title }: {
  active?: boolean; onClick: () => void; children: React.ReactNode; title?: string
}) => (
  <button
    type="button"
    title={title}
    onMouseDown={e => { e.preventDefault(); onClick() }}
    className={[
      'flex h-7 min-w-[26px] items-center justify-center rounded px-1 text-xs font-semibold transition-colors select-none',
      active ? 'bg-white/20 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white/90',
    ].join(' ')}
  >
    {children}
  </button>
)

function BubbleToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const s = useEditorState({
    editor,
    selector: (ctx) => ({
      bold: ctx.editor?.isActive('bold'),
      italic: ctx.editor?.isActive('italic'),
      underline: ctx.editor?.isActive('underline'),
      strike: ctx.editor?.isActive('strike'),
      code: ctx.editor?.isActive('code'),
      link: ctx.editor?.isActive('link'),
      h1: ctx.editor?.isActive('heading', { level: 1 }),
      h2: ctx.editor?.isActive('heading', { level: 2 }),
      h3: ctx.editor?.isActive('heading', { level: 3 }),
    }),
  })

  useEffect(() => {
    if (!editor) return
    const update = () => {
      const { from, to } = editor.state.selection
      if (from === to) { setPos(null); return }
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) { setPos(null); return }
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      if (!rect.width) { setPos(null); return }
      const tw = ref.current?.offsetWidth ?? 320
      const top = rect.top - 48
      const left = Math.max(8, Math.min(rect.left + (rect.width - tw) / 2, window.innerWidth - tw - 8))
      setPos({ top, left })
    }
    editor.on('selectionUpdate', update)
    editor.on('transaction', update)
    return () => { editor.off('selectionUpdate', update); editor.off('transaction', update) }
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
      <ToolBtn active={s?.h1} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="見出し1">H1</ToolBtn>
      <ToolBtn active={s?.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="見出し2">H2</ToolBtn>
      <ToolBtn active={s?.h3} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="見出し3">H3</ToolBtn>
      <span className="mx-1 h-4 w-px bg-white/[0.14]" />
      <ToolBtn active={s?.bold} onClick={() => editor.chain().focus().toggleBold().run()} title="太字"><strong>B</strong></ToolBtn>
      <ToolBtn active={s?.italic} onClick={() => editor.chain().focus().toggleItalic().run()} title="斜体"><em>I</em></ToolBtn>
      <ToolBtn active={s?.underline} onClick={() => editor.chain().focus().toggleUnderline().run()} title="下線"><span className="underline">U</span></ToolBtn>
      <ToolBtn active={s?.strike} onClick={() => editor.chain().focus().toggleStrike().run()} title="取り消し線"><span className="line-through">S</span></ToolBtn>
      <ToolBtn active={s?.code} onClick={() => editor.chain().focus().toggleCode().run()} title="コード">{'<>'}</ToolBtn>
      <ToolBtn active={s?.link} onClick={setLink} title="リンク">🔗</ToolBtn>
    </div>,
    document.body
  )
}

// ─── Main editor ──────────────────────────────────────────────────────────────

interface Props {
  content: string
  onChange: (json: string) => void
  onCharCount?: (chars: number, words: number) => void
  placeholder?: string
}

interface SlashState {
  query: string
  pos: { top: number; left: number }
  from: number   // position of the `/` in the doc
}

export function TiptapEditor({ content, onChange, onCharCount, placeholder = 'ここに書き殴ってください... (/ でブロック挿入)' }: Props) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [slash, setSlash] = useState<SlashState | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,  // replaced by CodeBlockLowlight
      }),
      Underline,
      Link.configure({ openOnClick: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: false, allowBase64: true }),
      CodeBlockLowlight.configure({ lowlight }),
      CharacterCount,
      Placeholder.configure({ placeholder, emptyEditorClass: 'is-editor-empty' }),
    ],
    content: (() => {
      if (!content) return ''
      try { return JSON.parse(content) as object }
      catch { return content }
    })(),
    onUpdate: ({ editor }) => {
      const json = JSON.stringify(editor.getJSON())
      onChange(json)

      // Char/word count
      if (onCharCount) {
        const text = editor.getText()
        const words = text.trim() ? text.trim().split(/\s+/).length : 0
        onCharCount(editor.storage.characterCount.characters(), words)
      }

      // Slash command detection
      const { from } = editor.state.selection
      const $from = editor.state.doc.resolve(from)
      const lineText = $from.parent.textContent.slice(0, $from.parentOffset)
      const slashIdx = lineText.lastIndexOf('/')

      if (slashIdx >= 0 && !/\s/.test(lineText.slice(slashIdx + 1))) {
        const docPos = from - (lineText.length - slashIdx)
        const coords = editor.view.coordsAtPos(docPos)
        setSlash({
          query: lineText.slice(slashIdx + 1),
          pos: { top: coords.bottom + 6, left: coords.left },
          from: docPos,
        })
      } else {
        setSlash(null)
      }
    },
    editorProps: {
      attributes: { class: 'tiptap outline-none' },
      handlePaste(view, event) {
        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            event.preventDefault()
            void resizeImageFromClipboard(item).then(dataUrl => {
              if (dataUrl) view.dispatch(view.state.tr.replaceSelectionWith(
                view.state.schema.nodes.image.create({ src: dataUrl })
              ))
            })
            return true
          }
        }
        return false
      },
      handleDrop(view, event) {
        const files = event.dataTransfer?.files
        if (!files?.length) return false
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
        if (!imageFiles.length) return false
        event.preventDefault()
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
        void Promise.all(imageFiles.map(resizeImageFile)).then(dataUrls => {
          dataUrls.forEach(dataUrl => {
            const insertPos = pos?.pos ?? view.state.doc.content.size
            view.dispatch(view.state.tr.insert(insertPos, view.state.schema.nodes.image.create({ src: dataUrl })))
          })
        })
        return true
      },
    },
  })

  // Sync content when switching notes
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

  // Close slash menu on click outside
  useEffect(() => {
    if (!slash) return
    const close = () => setSlash(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [slash])

  const handleImageFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    void resizeImageFile(file).then(dataUrl => {
      editor.chain().focus().setImage({ src: dataUrl }).run()
    })
    e.target.value = ''
  }

  const handleSlashImageInsert = () => {
    if (!editor || !slash) return
    // Delete the slash text before opening file input
    editor.chain().focus().deleteRange({ from: slash.from, to: editor.state.selection.from }).run()
    setSlash(null)
    imageInputRef.current?.click()
  }

  if (!editor) return null

  return (
    <div className="relative flex-1">
      <BubbleToolbar editor={editor} />

      {slash && (
        <SlashMenu
          editor={editor}
          query={slash.query}
          pos={slash.pos}
          onClose={() => setSlash(null)}
          onImageInsert={handleSlashImageInsert}
        />
      )}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFileInput}
      />

      <EditorContent editor={editor} className="px-6 py-4" />
    </div>
  )
}
