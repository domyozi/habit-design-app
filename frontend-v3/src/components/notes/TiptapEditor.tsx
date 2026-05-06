import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import CharacterCount from '@tiptap/extension-character-count'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
// Sprint notes-perf: lowlight all は 190+ 言語を bundle してロード時間が伸びる。
// 実用上は common (35 言語) で十分なので軽い方を採用する。
import { common, createLowlight } from 'lowlight'
import { UniqueId } from '@/extensions/UniqueId'
import { BulletListJa } from '@/extensions/BulletListJa'
import { OrderedListJa } from '@/extensions/OrderedListJa'
import { buildBlockUrl } from '@/lib/notes/noteAnchor'
import { SlashMenu } from '@/components/notes/SlashMenu'
import './notes-editor.css'

const lowlight = createLowlight(common)
const MAX_IMAGE_WIDTH = 1200

// Sprint notes-color: アプリの warm パレットに合わせた文字色 / 背景色のプリセット。
// v2 の青寄りパレットを 茶/オリーブ/陶器赤 などに置き換え、世界観で揃える。
const TEXT_COLORS: ReadonlyArray<string> = [
  '#0b0c0b', // default ink
  '#5a5a55', // warm gray
  '#ba6f31', // accent
  '#9b4f2f', // deep accent
  '#c44d2e', // terracotta
  '#a87132', // sand
  '#7e8a3c', // olive
  '#3a6d8a', // steel blue
  '#7a3d6e', // mulberry
  '#3d4a8a', // deep blue
  '#3a3d4e', // night
  '#b86a2e', // morning
]

const HIGHLIGHT_COLORS: ReadonlyArray<string> = [
  '#fde68a', // warm yellow
  '#fed7aa', // peach
  '#fecaca', // rose
  '#bbf7d0', // sage
  '#bae6fd', // sky
  '#e9d5ff', // lavender
  '#fbcfe8', // pink
  '#e7e5e4', // warm gray
]
const JPEG_QUALITY = 0.85

async function resizeImageFile(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const ratio = Math.min(1, MAX_IMAGE_WIDTH / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * ratio)
      canvas.height = Math.round(img.height * ratio)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve('')
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve('')
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

function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [isResizing, setIsResizing] = useState(false)
  const width = typeof node.attrs.width === 'number' ? node.attrs.width : Number.parseInt(String(node.attrs.width ?? ''), 10)

  const onMouseDown = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = (Number.isFinite(width) ? width : imgRef.current?.offsetWidth) ?? 480
    setIsResizing(true)

    const onMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.max(80, startWidth + moveEvent.clientX - startX)
      updateAttributes({ width: Math.round(nextWidth) })
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
    <NodeViewWrapper as="span" className="notes-image-node" data-selected={selected || isResizing ? 'true' : 'false'}>
      <img
        ref={imgRef}
        src={node.attrs.src as string}
        alt={(node.attrs.alt as string) || ''}
        draggable={false}
        width={Number.isFinite(width) ? width : undefined}
        style={{ width: Number.isFinite(width) ? `${width}px` : undefined }}
      />
      {(selected || isResizing) && (
        <span className="notes-image-resize-handle" role="presentation" onMouseDown={onMouseDown} />
      )}
    </NodeViewWrapper>
  )
}

const ResizableImage = Image.extend({
  renderHTML({ HTMLAttributes }) {
    const width = HTMLAttributes.width
    const style = [
      HTMLAttributes.style,
      width ? `width:${width}px` : '',
    ].filter(Boolean).join(';')
    return ['img', { ...HTMLAttributes, style }]
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },
})

interface Props {
  noteId: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

const parseContent = (value: string) => {
  if (!value) return { type: 'doc', content: [{ type: 'paragraph' }] }
  try {
    return JSON.parse(value)
  } catch {
    return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }] }
  }
}

export function TiptapEditor({ noteId, value, onChange, placeholder = 'Type / for blocks' }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [slash, setSlash] = useState<{ query: string; pos: { top: number; left: number } } | null>(null)
  const [copied, setCopied] = useState(false)
  // Sprint notes-link-popover: window.prompt の OS ダイアログを廃し、選択直下に小さい
  // ポップオーバーで URL を編集できるようにする。
  const [linkPopover, setLinkPopover] = useState<{
    pos: { top: number; left: number }
    initial: string
    rangeFrom: number
    rangeTo: number
  } | null>(null)
  const linkInputRef = useRef<HTMLInputElement>(null)

  const extensions = useMemo(() => [
    // bulletList / orderedList は Ja 版（`・ ` `１．` などの行頭マーカーも箇条書きへ
    // 自動変換）に差し替えるため、StarterKit 既定は無効化する。
    StarterKit.configure({
      codeBlock: false,
      link: false,
      underline: false,
      bulletList: false,
      orderedList: false,
    }),
    BulletListJa,
    OrderedListJa,
    Underline,
    // Sprint notes-link-click: クリックで実際にリンクへ飛べるよう openOnClick:true。
    // 編集はツールバーの 🔗 ポップオーバー経由。target=_blank で別タブ。
    Link.configure({
      openOnClick: true,
      autolink: true,
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
    }),
    Placeholder.configure({ placeholder }),
    TaskList,
    TaskItem.extend({
      addKeyboardShortcuts() {
        return {
          Enter: () => this.editor.commands.splitListItem(this.name),
          'Shift-Enter': () => this.editor.commands.setHardBreak(),
          Tab: () => {
            if (!this.editor.state.selection.empty) return false
            return this.editor.commands.sinkListItem(this.name)
          },
          'Shift-Tab': () => this.editor.commands.liftListItem(this.name),
          // Sprint notes-backspace-fix2:
          // ProseMirror の keymap plugin が Backspace handler を呼ぶ際、ハンドラ内で
          // `editor.commands.X()` を直接 dispatch すると、view の state がまだ keymap pass の
          // 途中であり、新規 tr の base state と applyTransaction 時の state が食い違う
          // ことがある（Applying a mismatched transaction 例外 + flushSync warning）。
          // 解: 判定だけ同期で行い、mutation は queueMicrotask に逃がす。これは React 警告が
          // 推奨する「scheduler task or micro task に移す」のと同じ方針。
          Backspace: () => {
            const editor = this.editor
            const { state } = editor
            const { $from, empty } = state.selection
            if (!empty) return false

            // 空 taskItem の先頭で Backspace → リスト項目を lift
            let willLift = false
            for (let depth = $from.depth; depth > 0; depth -= 1) {
              if ($from.node(depth).type.name === 'taskItem') {
                if ($from.parentOffset === 0) {
                  const item = $from.node(depth)
                  if (item.textContent === '' && item.childCount === 1) {
                    willLift = true
                  }
                }
                break
              }
            }

            // hardBreak 直後 → 1 文字分削除
            let deleteFrom = -1
            if (!willLift && $from.nodeBefore?.type.name === 'hardBreak') {
              deleteFrom = $from.pos - 1
            }

            if (!willLift && deleteFrom < 0) return false

            // 判定済 → 後で実行（current keymap pass を抜けてから dispatch）。
            const itemTypeName = this.name
            queueMicrotask(() => {
              if (editor.isDestroyed) return
              if (willLift) {
                editor.commands.liftListItem(itemTypeName)
              } else if (deleteFrom >= 0) {
                editor.commands.deleteRange({ from: deleteFrom, to: deleteFrom + 1 })
              }
            })
            return true  // ProseMirror に「我々が処理した」と返す（default Backspace を抑止）
          },
        }
      },
    }).configure({ nested: true }),
    ResizableImage.configure({
      inline: true,
      allowBase64: true,
    }),
    CharacterCount,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Highlight.configure({ multicolor: true }),
    TextStyle,
    Color,
    CodeBlockLowlight.configure({ lowlight }),
    UniqueId,
  ], [placeholder])

  const editor = useEditor({
    extensions,
    content: parseContent(value),
    editorProps: {
      attributes: { class: 'notes-editor-prosemirror' },
      handleKeyDown: (view, event) => {
        // Sprint notes-anchor-shortcut: Cmd/Ctrl + Shift + A で
        // 段落（ブロック）のアンカーリンクをクリップボードにコピー。
        // ツールバーの # ボタンと同じ動作。
        if ((event.metaKey || event.ctrlKey) && event.shiftKey && (event.key === 'a' || event.key === 'A')) {
          event.preventDefault()
          const { from } = view.state.selection
          let blockId: string | null = null
          view.state.doc.nodesBetween(from, from, (node) => {
            const id = node.attrs.id
            if (typeof id === 'string' && id) {
              blockId = id
              return false
            }
            return true
          })
          if (blockId) {
            void navigator.clipboard.writeText(buildBlockUrl(noteId, blockId)).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1300)
            })
          }
          return true
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          const { state } = view
          const { $from, from, to, empty } = state.selection

          if (empty) {
            for (let depth = $from.depth; depth > 0; depth -= 1) {
              const node = $from.node(depth)
              if (node.type.name === 'taskItem') {
                view.dispatch(state.tr.setNodeMarkup($from.before(depth), undefined, {
                  ...node.attrs,
                  checked: !node.attrs.checked,
                }))
                return true
              }
            }
            return true
          }

          const taskItems: Array<{ pos: number; checked: boolean; attrs: Record<string, unknown> }> = []
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (node.type.name === 'taskItem') {
              taskItems.push({ pos, checked: Boolean(node.attrs.checked), attrs: node.attrs })
            }
          })
          if (taskItems.length === 0) return true

          const targetChecked = taskItems.some((item) => !item.checked)
          let tr = state.tr
          for (const item of taskItems) {
            tr = tr.setNodeMarkup(item.pos, undefined, { ...item.attrs, checked: targetChecked })
          }
          view.dispatch(tr)
          return true
        }

        if (event.key !== '/') return false
        const coords = view.coordsAtPos(view.state.selection.from)
        setSlash({ query: '', pos: { top: coords.bottom + 8, left: coords.left } })
        return false
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of Array.from(items)) {
          if (!item.type.startsWith('image/')) continue
          event.preventDefault()
          void resizeImageFromClipboard(item).then((dataUrl) => {
            if (!dataUrl) return
            view.dispatch(view.state.tr.replaceSelectionWith(
              view.state.schema.nodes.image.create({ src: dataUrl }),
            ))
          })
          return true
        }
        return false
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files
        if (!files?.length) return false
        const images = Array.from(files).filter((file) => file.type.startsWith('image/'))
        if (images.length === 0) return false
        event.preventDefault()
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
        void Promise.all(images.map(resizeImageFile)).then((dataUrls) => {
          const insertPos = pos?.pos ?? view.state.doc.content.size
          let tr = view.state.tr
          dataUrls.filter(Boolean).forEach((dataUrl, index) => {
            tr = tr.insert(insertPos + index, view.state.schema.nodes.image.create({ src: dataUrl }))
          })
          view.dispatch(tr)
        })
        return true
      },
    },
    onUpdate: ({ editor: currentEditor, transaction }) => {
      if (transaction.getMeta('uniqueId/silent')) return
      onChange(JSON.stringify(currentEditor.getJSON()))
      // Sprint notes-flushsync-fix: tiptap の transaction commit 中に React setState を
      // 直接呼ぶと、tiptap-react が view 同期で flushSync を呼ぶタイミングで
      // 「flushSync called from inside a lifecycle method」warning が出る。
      // queueMicrotask に逃せば commit 完了後に setState されるので警告が出ない。
      const { from } = currentEditor.state.selection
      const textBefore = currentEditor.state.doc.textBetween(Math.max(0, from - 32), from, '\n', '\0')
      const match = textBefore.match(/\/([^\s/]*)$/)
      queueMicrotask(() => {
        if (!match) {
          setSlash(null)
          return
        }
        try {
          const coords = currentEditor.view.coordsAtPos(from)
          setSlash({ query: match[1], pos: { top: coords.bottom + 8, left: coords.left } })
        } catch {
          // doc が変化して pos が無効になった場合: silent
          setSlash(null)
        }
      })
    },
  })

  useEffect(() => {
    if (!editor) return
    const current = JSON.stringify(editor.getJSON())
    if (current === value) return
    // Sprint notes-flushsync-fix: setContent は ProseMirror transaction を発火し、
    // tiptap-react が view 同期で flushSync を呼ぶ。useEffect は render 直後だが、
    // 別 component の再 render と重なると flushSync warning になるため microtask 化。
    queueMicrotask(() => {
      if (editor.isDestroyed) return
      editor.commands.setContent(parseContent(value), { emitUpdate: false })
    })
  }, [editor, value])

  useEffect(() => {
    if (!editor || !window.location.hash) return
    const id = decodeURIComponent(window.location.hash.slice(1))
    window.setTimeout(() => {
      const el = document.getElementById(id)
      el?.scrollIntoView({ block: 'center' })
      el?.classList.add('notes-anchor-flash')
      window.setTimeout(() => el?.classList.remove('notes-anchor-flash'), 1400)
    }, 120)
  }, [editor, noteId])

  const insertImageFile = useCallback((file: File) => {
    if (!editor) return
    void resizeImageFile(file).then((src) => {
      if (src) editor.chain().focus().setImage({ src, alt: file.name }).run()
    })
  }, [editor])

  const copyBlockLink = useCallback(async () => {
    if (!editor) return
    const { from } = editor.state.selection
    let blockId: string | null = null
    editor.state.doc.nodesBetween(from, from, (node) => {
      const id = node.attrs.id
      if (typeof id === 'string' && id) {
        blockId = id
        return false
      }
      return true
    })
    if (!blockId) return
    await navigator.clipboard.writeText(buildBlockUrl(noteId, blockId))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1300)
  }, [editor, noteId])

  if (!editor) return null

  const openLinkPopover = () => {
    if (!editor) return
    // 選択範囲を保持。空選択でも単語単位で extendMarkRange して既存リンクを編集できるようにする。
    editor.chain().focus().extendMarkRange('link').run()
    const { from, to } = editor.state.selection
    const previous = (editor.getAttributes('link').href as string | undefined) ?? ''
    const coords = editor.view.coordsAtPos(to)
    setLinkPopover({
      pos: { top: coords.bottom + 6, left: coords.left },
      initial: previous,
      rangeFrom: from,
      rangeTo: to,
    })
    // input にフォーカスは effect 側で。
  }

  const applyLink = (href: string) => {
    if (!editor || !linkPopover) return
    const trimmed = href.trim()
    const chain = editor.chain().focus().setTextSelection({ from: linkPopover.rangeFrom, to: linkPopover.rangeTo })
    if (!trimmed) chain.unsetLink().run()
    else chain.extendMarkRange('link').setLink({ href: trimmed }).run()
    setLinkPopover(null)
  }

  // Sprint notes-button-mousedown: 通常の onClick はボタンに focus を奪われ、
  // editor の selection が壊れることがある（特に setTextAlign のような node 属性更新）。
  // 解: mousedown 段階で preventDefault して focus 移動を抑止 → click は通常通り発火 →
  //     onClick で editor command を実行する。これで selection を保ったまま動く。
  // 単に onMouseDown でコマンドを叩くと Playwright のような自動操作で動かないことがある
  // ので、両イベントを使い分けるのが堅い。
  const toolButton = (run: () => void) => ({
    onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault(),
    onClick: run,
  })

  return (
    <div className="notes-editor-shell">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="notes-file-input"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (file) insertImageFile(file)
          event.currentTarget.value = ''
        }}
      />
      <div className="notes-toolbar" aria-label="Note toolbar">
        {/* Sprint notes-toolbar: Notion / DocBase 風に再構成。
            - 見出しは select dropdown（H1/H2/H3 を畳む）
            - グループ間に縦罫
            - ボタンはフラット（hover で薄く着色） */}
        <div className="notes-toolbar-group">
          <button type="button" title="Undo" {...toolButton(() => editor.chain().focus().undo().run())} disabled={!editor.can().undo()}>↶</button>
          <button type="button" title="Redo" {...toolButton(() => editor.chain().focus().redo().run())} disabled={!editor.can().redo()}>↷</button>
        </div>
        <div className="notes-toolbar-divider" />
        <div className="notes-toolbar-group">
          <select
            className="notes-toolbar-select"
            value={
              editor.isActive('heading', { level: 1 }) ? 'h1'
              : editor.isActive('heading', { level: 2 }) ? 'h2'
              : editor.isActive('heading', { level: 3 }) ? 'h3'
              : 'p'
            }
            onChange={(event) => {
              const v = event.currentTarget.value
              if (v === 'p') editor.chain().focus().setParagraph().run()
              else if (v === 'h1') editor.chain().focus().setHeading({ level: 1 }).run()
              else if (v === 'h2') editor.chain().focus().setHeading({ level: 2 }).run()
              else if (v === 'h3') editor.chain().focus().setHeading({ level: 3 }).run()
            }}
          >
            <option value="p">本文</option>
            <option value="h1">見出し 1</option>
            <option value="h2">見出し 2</option>
            <option value="h3">見出し 3</option>
          </select>
        </div>
        <div className="notes-toolbar-divider" />
        <div className="notes-toolbar-group">
          <button type="button" title="Bold (⌘B)" className={`is-bold ${editor.isActive('bold') ? 'is-active' : ''}`} {...toolButton(() => editor.chain().focus().toggleBold().run())}>B</button>
          <button type="button" title="Italic (⌘I)" className={`is-italic ${editor.isActive('italic') ? 'is-active' : ''}`} {...toolButton(() => editor.chain().focus().toggleItalic().run())}>I</button>
          <button type="button" title="Underline (⌘U)" className={`is-underline ${editor.isActive('underline') ? 'is-active' : ''}`} {...toolButton(() => editor.chain().focus().toggleUnderline().run())}>U</button>
          <button type="button" title="Strike (⌘⇧X)" className={`is-strike ${editor.isActive('strike') ? 'is-active' : ''}`} {...toolButton(() => editor.chain().focus().toggleStrike().run())}>S</button>
          <button type="button" title="Inline code" className={editor.isActive('code') ? 'is-active' : ''} {...toolButton(() => editor.chain().focus().toggleCode().run())}>{'</>'}</button>
        </div>
        <div className="notes-toolbar-divider" />
        {/* Sprint notes-color: 文字色 / 背景色 ピッカー。warm パレット。 */}
        <div className="notes-toolbar-group">
          <ColorPickerButton
            icon={<span className="notes-color-icon-text">A</span>}
            title="文字色"
            colors={TEXT_COLORS}
            activeColor={editor.getAttributes('textStyle').color as string | undefined}
            onSelect={(c) => editor.chain().focus().setColor(c).run()}
            onClear={() => editor.chain().focus().unsetColor().run()}
          />
          <ColorPickerButton
            icon={<span className="notes-color-icon-hl">A</span>}
            title="背景色"
            colors={HIGHLIGHT_COLORS}
            activeColor={editor.getAttributes('highlight').color as string | undefined}
            onSelect={(c) => editor.chain().focus().toggleHighlight({ color: c }).run()}
            onClear={() => editor.chain().focus().unsetHighlight().run()}
          />
        </div>
        <div className="notes-toolbar-divider" />
        {/* Sprint notes-align: テキスト揃え。 */}
        <div className="notes-toolbar-group">
          <button type="button" title="左揃え" className={editor.isActive({ textAlign: 'left' }) || (!editor.isActive({ textAlign: 'center' }) && !editor.isActive({ textAlign: 'right' })) ? 'is-active' : ''} {...toolButton(() => editor.chain().focus().setTextAlign('left').run())}>⇤</button>
          <button type="button" title="中央揃え" className={editor.isActive({ textAlign: 'center' }) ? 'is-active' : ''} {...toolButton(() => editor.chain().focus().setTextAlign('center').run())}>⇔</button>
          <button type="button" title="右揃え" className={editor.isActive({ textAlign: 'right' }) ? 'is-active' : ''} {...toolButton(() => editor.chain().focus().setTextAlign('right').run())}>⇥</button>
        </div>
        <div className="notes-toolbar-divider" />
        <div className="notes-toolbar-group">
          <button type="button" title="箇条書き" className={editor.isActive('bulletList') ? 'is-active' : ''} {...toolButton(() => editor.chain().focus().toggleBulletList().run())}>•</button>
          <button type="button" title="番号付き" className={editor.isActive('orderedList') ? 'is-active' : ''} {...toolButton(() => editor.chain().focus().toggleOrderedList().run())}>1.</button>
          <button type="button" title="チェックリスト" className={editor.isActive('taskList') ? 'is-active' : ''} {...toolButton(() => editor.chain().focus().toggleTaskList().run())}>☑</button>
        </div>
        <div className="notes-toolbar-divider" />
        <div className="notes-toolbar-group">
          <button type="button" title="リンク" className={editor.isActive('link') ? 'is-active' : ''} {...toolButton(openLinkPopover)}>🔗</button>
          <button type="button" title="画像" {...toolButton(() => fileInputRef.current?.click())}>🖼</button>
          <button type="button" title="コードブロック" className={editor.isActive('codeBlock') ? 'is-active' : ''} {...toolButton(() => editor.chain().focus().toggleCodeBlock().run())}>{'{ }'}</button>
          <button type="button" title="区切り線" {...toolButton(() => editor.chain().focus().setHorizontalRule().run())}>—</button>
        </div>
        <div className="notes-toolbar-divider" />
        <div className="notes-toolbar-group">
          <button type="button" title="ブロックリンクをコピー" {...toolButton(copyBlockLink)}>#</button>
        </div>
      </div>
      <EditorContent editor={editor} />
      {slash && (
        <SlashMenu
          editor={editor}
          query={slash.query}
          pos={slash.pos}
          onClose={() => setSlash(null)}
          onImageInsert={() => fileInputRef.current?.click()}
          onCopyBlockLink={copyBlockLink}
        />
      )}
      {linkPopover && (
        <LinkPopover
          inputRef={linkInputRef}
          initial={linkPopover.initial}
          pos={linkPopover.pos}
          onApply={applyLink}
          onClose={() => setLinkPopover(null)}
        />
      )}
      <BubbleToolbar editor={editor} onLinkClick={openLinkPopover} />
      {copied && <div className="notes-copy-toast">LINK COPIED</div>}
    </div>
  )
}

// Sprint notes-color: 文字色 / 背景色 用のドロップダウン式 ColorPicker。
// アイコン（A や 🖍）を押すと下にスウォッチが開き、選択で apply、クリアで unset。
interface ColorPickerProps {
  /** ボタンに表示するアイコン文字 */
  icon: React.ReactNode
  /** タイトル（tooltip） */
  title: string
  /** 色プリセット */
  colors: ReadonlyArray<string>
  /** 現在選択中の色（active バー表示用） */
  activeColor?: string
  /** 色を選んだとき */
  onSelect: (color: string) => void
  /** 解除を押したとき */
  onClear: () => void
}

function ColorPickerButton({ icon, title, colors, activeColor, onSelect, onClear }: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="notes-color-picker" ref={ref}>
      <button
        type="button"
        title={title}
        onMouseDown={(event) => {
          event.preventDefault()
          setOpen((v) => !v)
        }}
        className={open ? 'is-active' : ''}
      >
        {icon}
        {/* 現在の色を ボタン下端の細いバーで示す（v2 の踏襲）。 */}
        <span
          className="notes-color-picker-active"
          style={{ background: activeColor ?? 'transparent' }}
        />
      </button>
      {open && (
        <div className="notes-color-picker-menu" onMouseDown={(e) => e.stopPropagation()}>
          <div className="notes-color-picker-grid">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  onSelect(c)
                  setOpen(false)
                }}
                style={{ background: c }}
                className={activeColor === c ? 'is-selected' : ''}
                aria-label={c}
              />
            ))}
          </div>
          <button
            type="button"
            className="notes-color-picker-clear"
            onMouseDown={(event) => {
              event.preventDefault()
              onClear()
              setOpen(false)
            }}
          >
            クリア
          </button>
        </div>
      )}
    </div>
  )
}

interface LinkPopoverProps {
  initial: string
  pos: { top: number; left: number }
  onApply: (href: string) => void
  onClose: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
}

function LinkPopover({ initial, pos, onApply, onClose, inputRef }: LinkPopoverProps) {
  const [value, setValue] = useState(initial)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [inputRef])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.notes-link-popover')) return
      onClose()
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [onClose])

  return (
    <div
      className="notes-link-popover"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
        placeholder="https://"
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onApply(value)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
        }}
      />
      <button type="button" onClick={() => onApply(value)} className="notes-link-popover-apply">適用</button>
      {initial && (
        <button type="button" onClick={() => onApply('')} className="notes-link-popover-remove" title="リンク解除">
          解除
        </button>
      )}
    </div>
  )
}

// Sprint notes-bubble: テキスト選択時にカーソルの上に floating で出る小ツールバー。
// 選択中のテキストに B/I/U/S/code を即座にかけるための副ツールバー。
// メインのツールバーは固定なのでスクロールでも消えない、これは選択時の補助。
interface BubbleToolbarProps {
  editor: ReturnType<typeof useEditor>
  onLinkClick: () => void
}

function BubbleToolbar({ editor, onLinkClick }: BubbleToolbarProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editor) return
    const update = () => {
      const { from, to, empty } = editor.state.selection
      if (empty || from === to) {
        setPos(null)
        return
      }
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) {
        setPos(null)
        return
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      if (!rect.width) {
        setPos(null)
        return
      }
      const tw = ref.current?.offsetWidth ?? 240
      const top = Math.max(8, rect.top - 42)
      const left = Math.max(8, Math.min(rect.left + (rect.width - tw) / 2, window.innerWidth - tw - 8))
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

  return (
    <div
      ref={ref}
      className="notes-bubble-toolbar"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button type="button" title="Bold" className={`is-bold ${editor.isActive('bold') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleBold().run()}>B</button>
      <button type="button" title="Italic" className={`is-italic ${editor.isActive('italic') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleItalic().run()}>I</button>
      <button type="button" title="Underline" className={`is-underline ${editor.isActive('underline') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleUnderline().run()}>U</button>
      <button type="button" title="Strike" className={`is-strike ${editor.isActive('strike') ? 'is-active' : ''}`} onClick={() => editor.chain().focus().toggleStrike().run()}>S</button>
      <button type="button" title="Code" className={editor.isActive('code') ? 'is-active' : ''} onClick={() => editor.chain().focus().toggleCode().run()}>{'</>'}</button>
      <button type="button" title="Link" className={editor.isActive('link') ? 'is-active' : ''} onClick={onLinkClick}>🔗</button>
    </div>
  )
}
