import { useEditor, EditorContent, useEditorState, ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import CharacterCount from '@tiptap/extension-character-count'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
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

// ─── Resizable image node view ────────────────────────────────────────────────

const ResizableImageView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const imgRef = useRef<HTMLImageElement>(null)
  const [isResizing, setIsResizing] = useState(false)

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = (node.attrs.width as number | null) ?? imgRef.current?.offsetWidth ?? 400
    setIsResizing(true)

    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.max(80, startWidth + (ev.clientX - startX))
      updateAttributes({ width: newWidth })
    }
    const onMouseUp = () => {
      setIsResizing(false)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <NodeViewWrapper as="span" style={{ display: 'inline-block', position: 'relative', verticalAlign: 'bottom', lineHeight: 0 }}>
      <img
        ref={imgRef}
        src={node.attrs.src as string}
        alt={(node.attrs.alt as string) || ''}
        draggable={false}
        style={{
          width: node.attrs.width ? `${node.attrs.width as number}px` : '100%',
          maxWidth: '100%',
          display: 'block',
          borderRadius: '8px',
          border: selected || isResizing ? '2px solid #7dd3fc' : '1px solid rgba(255,255,255,0.08)',
          margin: '4px 0',
          userSelect: 'none',
        }}
      />
      {(selected || isResizing) && (
        <span
          style={{
            position: 'absolute',
            right: -5,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 10,
            height: 32,
            background: '#7dd3fc',
            borderRadius: 5,
            cursor: 'ew-resize',
            zIndex: 10,
            display: 'block',
          }}
          onMouseDown={handleMouseDown}
        />
      )}
    </NodeViewWrapper>
  )
}

const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: el => {
          const w = el.getAttribute('width')
          return w ? parseInt(w) : null
        },
        renderHTML: attrs => {
          if (!attrs.width) return {}
          return { width: String(attrs.width as number), style: `width:${attrs.width as number}px` }
        },
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },
})

// ─── Color palettes ───────────────────────────────────────────────────────────

const TEXT_COLORS = [
  '#ffffff', '#a0aec0', '#fc8181', '#f6ad55',
  '#faf089', '#68d391', '#76e4f7', '#90cdf4',
  '#b794f4', '#f687b3', '#fbd38d', '#86efac',
]

const HIGHLIGHT_COLORS = [
  '#fecaca', '#fed7aa', '#fef08a', '#bbf7d0',
  '#bae6fd', '#e9d5ff', '#fbcfe8', '#d1d5db',
]

// ─── Shared ToolBtn ───────────────────────────────────────────────────────────

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

const Sep = () => <span className="mx-1 h-4 w-px bg-white/[0.14]" />

// ─── Color picker popup ───────────────────────────────────────────────────────

const ColorPicker = ({
  colors,
  onSelect,
  onClear,
  children,
  title,
  activeColor,
}: {
  colors: string[]
  onSelect: (color: string) => void
  onClear: () => void
  children: React.ReactNode
  title?: string
  activeColor?: string
}) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={title}
        onMouseDown={e => { e.preventDefault(); setOpen(v => !v) }}
        className="flex h-7 min-w-[26px] items-center justify-center rounded px-1 text-xs font-semibold transition-colors select-none text-white/60 hover:bg-white/10 hover:text-white/90"
      >
        {children}
        {activeColor && (
          <span
            className="ml-0.5 inline-block h-1.5 w-3 rounded-full"
            style={{ backgroundColor: activeColor }}
          />
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-50 rounded-xl border border-white/[0.14] bg-[#0d1825]/96 p-2 shadow-2xl backdrop-blur-xl" style={{ width: 120 }}>
          <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {colors.map(c => (
              <button
                key={c}
                type="button"
                onMouseDown={e => { e.preventDefault(); onSelect(c); setOpen(false) }}
                className="aspect-square w-full rounded border border-white/10 transition-transform hover:scale-110"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); onClear(); setOpen(false) }}
            className="mt-1.5 w-full text-center text-[10px] text-white/40 hover:text-white/70"
          >
            クリア
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Fixed toolbar ────────────────────────────────────────────────────────────

function FixedToolbar({
  editor,
  onImageClick,
  actionsSlot,
}: {
  editor: ReturnType<typeof useEditor>
  onImageClick: () => void
  actionsSlot?: React.ReactNode
}) {
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
      alignCenter: ctx.editor?.isActive({ textAlign: 'center' }),
      alignRight: ctx.editor?.isActive({ textAlign: 'right' }),
      taskList: ctx.editor?.isActive('taskList'),
      color: ctx.editor?.getAttributes('textStyle').color as string | undefined,
      highlight: ctx.editor?.getAttributes('highlight').color as string | undefined,
    }),
  })

  if (!editor) return null

  const headingValue = s?.h1 ? '1' : s?.h2 ? '2' : s?.h3 ? '3' : '0'

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('URL', prev ?? '')
    if (url === null) return
    if (url === '') { editor.chain().focus().unsetLink().run(); return }
    editor.chain().focus().setLink({ href: url }).run()
  }

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-0.5 border-b border-white/[0.08] bg-[#0b1320]/95 px-2 py-1 backdrop-blur-sm">
      {/* Undo / Redo */}
      <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="元に戻す">↩</ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="やり直す">↪</ToolBtn>
      <Sep />

      {/* Heading selector */}
      <select
        value={headingValue}
        onChange={e => {
          const v = e.target.value
          if (v === '0') editor.chain().focus().setParagraph().run()
          else editor.chain().focus().toggleHeading({ level: Number(v) as 1 | 2 | 3 }).run()
        }}
        onMouseDown={e => e.stopPropagation()}
        className="h-7 rounded bg-white/[0.06] px-1.5 text-[11px] text-white/70 focus:outline-none cursor-pointer"
      >
        <option value="0">本文</option>
        <option value="1">H1</option>
        <option value="2">H2</option>
        <option value="3">H3</option>
      </select>
      <Sep />

      {/* Text formatting */}
      <ToolBtn active={s?.bold} onClick={() => editor.chain().focus().toggleBold().run()} title="太字"><strong>B</strong></ToolBtn>
      <ToolBtn active={s?.italic} onClick={() => editor.chain().focus().toggleItalic().run()} title="斜体"><em>I</em></ToolBtn>
      <ToolBtn active={s?.underline} onClick={() => editor.chain().focus().toggleUnderline().run()} title="下線"><span className="underline">U</span></ToolBtn>
      <ToolBtn active={s?.strike} onClick={() => editor.chain().focus().toggleStrike().run()} title="取り消し線"><span className="line-through">S</span></ToolBtn>
      <ToolBtn active={s?.code} onClick={() => editor.chain().focus().toggleCode().run()} title="コード">{'<>'}</ToolBtn>
      <Sep />

      {/* Text color */}
      <ColorPicker
        colors={TEXT_COLORS}
        onSelect={c => editor.chain().focus().setColor(c).run()}
        onClear={() => editor.chain().focus().unsetColor().run()}
        title="文字色"
        activeColor={s?.color}
      >
        <span className="font-bold" style={{ color: s?.color ?? 'rgba(255,255,255,0.6)' }}>A</span>
      </ColorPicker>

      {/* Highlight */}
      <ColorPicker
        colors={HIGHLIGHT_COLORS}
        onSelect={c => editor.chain().focus().toggleHighlight({ color: c }).run()}
        onClear={() => editor.chain().focus().unsetHighlight().run()}
        title="背景色"
        activeColor={s?.highlight}
      >
        <span className="underline decoration-[3px]" style={{ textDecorationColor: s?.highlight ?? 'rgba(255,255,255,0.4)' }}>A</span>
      </ColorPicker>
      <Sep />

      {/* Text align */}
      <ToolBtn active={!s?.alignCenter && !s?.alignRight} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="左揃え">≡</ToolBtn>
      <ToolBtn active={s?.alignCenter} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="中央揃え">
        <svg width="12" height="10" viewBox="0 0 12 10" fill="currentColor"><rect x="1" y="0" width="10" height="1.5" rx="0.75"/><rect x="2.5" y="3" width="7" height="1.5" rx="0.75"/><rect x="1" y="6" width="10" height="1.5" rx="0.75"/><rect x="2.5" y="9" width="7" height="1.5" rx="0.75"/></svg>
      </ToolBtn>
      <ToolBtn active={s?.alignRight} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="右揃え">
        <svg width="12" height="10" viewBox="0 0 12 10" fill="currentColor"><rect x="1" y="0" width="10" height="1.5" rx="0.75"/><rect x="4" y="3" width="7" height="1.5" rx="0.75"/><rect x="1" y="6" width="10" height="1.5" rx="0.75"/><rect x="4" y="9" width="7" height="1.5" rx="0.75"/></svg>
      </ToolBtn>
      <Sep />

      {/* Insert */}
      <ToolBtn active={s?.taskList} onClick={() => editor.chain().focus().toggleTaskList().run()} title="チェックリスト">☑</ToolBtn>
      <ToolBtn onClick={onImageClick} title="画像を挿入">🖼</ToolBtn>
      <ToolBtn active={s?.link} onClick={setLink} title="リンク">🔗</ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="区切り線">—</ToolBtn>

      {actionsSlot && (
        <>
          <span className="ml-auto" />
          <Sep />
          {actionsSlot}
        </>
      )}
    </div>
  )
}

// ─── Bubble toolbar (text-selection) ─────────────────────────────────────────

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
      const tw = ref.current?.offsetWidth ?? 280
      const top = rect.top - 48
      const left = Math.max(8, Math.min(rect.left + (rect.width - tw) / 2, window.innerWidth - tw - 8))
      setPos({ top, left })
    }
    editor.on('selectionUpdate', update)
    editor.on('transaction', update)
    return () => { editor.off('selectionUpdate', update); editor.off('transaction', update) }
  }, [editor])

  if (!pos || !editor) return null

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 flex items-center gap-0.5 rounded-xl border border-white/[0.14] bg-[#0d1825]/96 px-2 py-1.5 shadow-2xl backdrop-blur-xl"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={e => e.preventDefault()}
    >
      <ToolBtn active={s?.bold} onClick={() => editor.chain().focus().toggleBold().run()} title="太字"><strong>B</strong></ToolBtn>
      <ToolBtn active={s?.italic} onClick={() => editor.chain().focus().toggleItalic().run()} title="斜体"><em>I</em></ToolBtn>
      <ToolBtn active={s?.underline} onClick={() => editor.chain().focus().toggleUnderline().run()} title="下線"><span className="underline">U</span></ToolBtn>
      <ToolBtn active={s?.strike} onClick={() => editor.chain().focus().toggleStrike().run()} title="取り消し線"><span className="line-through">S</span></ToolBtn>
      <ToolBtn active={s?.code} onClick={() => editor.chain().focus().toggleCode().run()} title="コード">{'<>'}</ToolBtn>
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
  actionsSlot?: React.ReactNode
  headerSlot?: React.ReactNode
}

interface SlashState {
  query: string
  pos: { top: number; left: number }
  from: number
}

export function TiptapEditor({ content, onChange, onCharCount, placeholder = 'ここに書き殴ってください... (/ でブロック挿入)', actionsSlot, headerSlot }: Props) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [slash, setSlash] = useState<SlashState | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      Underline,
      Link.configure({ openOnClick: false }),
      TaskList,
      TaskItem.extend({
        addKeyboardShortcuts() {
          return {
            // Enter → 新しいチェックリスト行
            'Enter': () => this.editor.commands.splitListItem(this.name),
            // Shift+Enter → 同じ項目内でソフト改行（チェックなし）
            'Shift-Enter': () => this.editor.commands.setHardBreak(),
            // Tab → カーソル行のみ一段深くネスト（選択中は無効）
            'Tab': () => {
              if (!this.editor.state.selection.empty) return false
              return this.editor.commands.sinkListItem(this.name)
            },
            // Shift+Tab → 一段上げる
            'Shift-Tab': () => this.editor.commands.liftListItem(this.name),
            // Cmd/Ctrl+Enter は editorProps.handleKeyDown で処理（他拡張に取られないよう低レベルで捕捉）
            // Backspace
            'Backspace': () => this.editor.commands.command(({ state }) => {
              const { $from } = state.selection
              if (!state.selection.empty) return false

              // 空 taskItem の先頭 → 段落化（上の行にジャンプさせない）
              let taskItemDepth = -1
              for (let d = $from.depth; d > 0; d--) {
                if ($from.node(d).type.name === 'taskItem') { taskItemDepth = d; break }
              }
              if (taskItemDepth !== -1 && $from.parentOffset === 0) {
                const item = $from.node(taskItemDepth)
                if (item.textContent === '' && item.childCount === 1) {
                  return this.editor.commands.liftListItem(this.name)
                }
              }

              // hardBreak 直後 → 削除
              const nodeBefore = $from.nodeBefore
              if (nodeBefore?.type.name === 'hardBreak') {
                return this.editor.commands.deleteRange({ from: $from.pos - 1, to: $from.pos })
              }
              return false
            }),
          }
        },
      }).configure({ nested: true }),
      ResizableImage.configure({ inline: true, allowBase64: true }),
      CodeBlockLowlight.configure({ lowlight }),
      CharacterCount,
      Placeholder.configure({ placeholder, emptyEditorClass: 'is-editor-empty' }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: (() => {
      if (!content) return ''
      try { return JSON.parse(content) as object }
      catch { return content }
    })(),
    onUpdate: ({ editor }) => {
      const json = JSON.stringify(editor.getJSON())
      onChange(json)

      if (onCharCount) {
        const text = editor.getText()
        const words = text.trim() ? text.trim().split(/\s+/).length : 0
        onCharCount(editor.storage.characterCount.characters(), words)
      }

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
      // Mod+Enter:
      //   - カーソル位置が taskItem 内（選択無し）→ そのアイテムを toggle
      //   - 範囲選択が複数 taskItem を跨ぐ → 1 つでも未チェックがあれば全部チェック、
      //     全チェック済みなら全部外す（GitHub 等の複数選択操作と同じ振る舞い）
      handleKeyDown(view, event) {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          const { state } = view
          const { $from, from, to, empty } = state.selection

          if (empty) {
            for (let d = $from.depth; d > 0; d--) {
              const node = $from.node(d)
              if (node.type.name === 'taskItem') {
                const tr = state.tr.setNodeMarkup($from.before(d), undefined, {
                  ...node.attrs,
                  checked: !node.attrs.checked,
                })
                view.dispatch(tr)
                return true
              }
            }
            return true
          }

          // 範囲選択：選択範囲に含まれる taskItem を全て収集
          const taskItems: Array<{ pos: number; checked: boolean; attrs: Record<string, unknown> }> = []
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (node.type.name === 'taskItem') {
              taskItems.push({ pos, checked: Boolean(node.attrs.checked), attrs: node.attrs })
            }
          })

          if (taskItems.length === 0) return true

          const anyUnchecked = taskItems.some(t => !t.checked)
          const targetChecked = anyUnchecked
          let tr = state.tr
          for (const t of taskItems) {
            tr = tr.setNodeMarkup(t.pos, undefined, { ...t.attrs, checked: targetChecked })
          }
          view.dispatch(tr)
          return true
        }
        return false
      },
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
    editor.chain().focus().deleteRange({ from: slash.from, to: editor.state.selection.from }).run()
    setSlash(null)
    imageInputRef.current?.click()
  }

  const handleToolbarImageClick = () => {
    imageInputRef.current?.click()
  }

  if (!editor) return null

  return (
    <div className="relative flex-1 flex flex-col">
      <FixedToolbar editor={editor} onImageClick={handleToolbarImageClick} actionsSlot={actionsSlot} />
      {headerSlot}
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

      <EditorContent editor={editor} className="px-6 py-4 flex-1" />
    </div>
  )
}
