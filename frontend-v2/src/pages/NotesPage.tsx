import { useState, useEffect, useRef, useCallback } from 'react'
import { TiptapEditor } from '@/components/editor/TiptapEditor'
import { useNotes } from '@/hooks/useNotes'
import { exportToMarkdown } from '@/lib/note-export'

const DEBOUNCE_MS = 400

const formatRelative = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'たった今'
  if (mins < 60) return `${mins}分前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}時間前`
  return `${Math.floor(hrs / 24)}日前`
}

export function NotesPage() {
  const { notes, selected, selectedId, setSelectedId, createNote, updateNote, deleteNote } = useNotes()
  const [localTitle, setLocalTitle] = useState('')
  const [localBody, setLocalBody] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const [query, setQuery] = useState('')
  const [charCount, setCharCount] = useState(0)
  const [wordCount, setWordCount] = useState(0)
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bodyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (selected) {
      setLocalTitle(selected.title)
      setLocalBody(selected.body)
      setShowEditor(true)
      setCharCount(0)
      setWordCount(0)
    }
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTitleChange = (value: string) => {
    setLocalTitle(value)
    if (titleTimer.current) clearTimeout(titleTimer.current)
    titleTimer.current = setTimeout(() => {
      if (selectedId) updateNote(selectedId, { title: value })
    }, DEBOUNCE_MS)
  }

  const handleBodyChange = useCallback((json: string) => {
    setLocalBody(json)
    if (bodyTimer.current) clearTimeout(bodyTimer.current)
    bodyTimer.current = setTimeout(() => {
      if (selectedId) updateNote(selectedId, { body: json })
    }, DEBOUNCE_MS)
  }, [selectedId, updateNote])

  const handleCreate = useCallback(() => {
    createNote()
    setLocalTitle('')
    setLocalBody('')
    setShowEditor(true)
  }, [createNote])

  const handleDelete = (id: string) => {
    deleteNote(id)
    setShowEditor(false)
  }

  const handlePinToggle = (id: string, pinned: boolean) => {
    updateNote(id, { pinned: !pinned })
  }

  const handleExport = () => {
    if (!selected) return
    exportToMarkdown(localTitle || '無題のノート', localBody)
  }

  const displayTitle = (note: { title: string }) =>
    note.title.trim() || '無題のノート'

  const filteredNotes = query.trim()
    ? notes.filter(n =>
        n.title.toLowerCase().includes(query.toLowerCase()) ||
        n.body.toLowerCase().includes(query.toLowerCase())
      )
    : notes

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024

  return (
    <div className="flex h-full min-h-[calc(100svh-64px)] flex-col lg:flex-row">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      {(!showEditor || !isMobile) && (
        <div className="flex w-full flex-col border-b border-white/[0.06] lg:w-64 lg:min-w-[240px] lg:border-b-0 lg:border-r">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-white/[0.06]">
            <h1 className="text-sm font-semibold text-white/88">ノート</h1>
            <button
              type="button"
              onClick={handleCreate}
              className="rounded-xl border border-[#86efac]/20 bg-[#86efac]/10 px-3 py-1.5 text-[11px] font-semibold text-[#86efac] hover:bg-[#86efac]/18 transition-colors"
            >
              + 新規作成
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-white/[0.04]">
            <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
              <span className="text-[11px] text-white/30">🔍</span>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="検索..."
                className="flex-1 bg-transparent text-xs text-white/70 placeholder:text-white/25 outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="text-[10px] text-white/30 hover:text-white/60">✕</button>
              )}
            </div>
          </div>

          {/* Note list */}
          <div className="flex-1 overflow-y-auto">
            {filteredNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
                <span className="text-3xl text-white/20">✎</span>
                {query ? (
                  <p className="text-sm text-white/36">「{query}」に一致するノートがありません</p>
                ) : (
                  <>
                    <p className="text-sm text-white/36">ノートがありません</p>
                    <button
                      type="button"
                      onClick={handleCreate}
                      className="mt-1 rounded-xl border border-[#86efac]/20 bg-[#86efac]/10 px-4 py-2 text-xs font-semibold text-[#86efac] hover:bg-[#86efac]/18 transition-colors"
                    >
                      最初のノートを作成
                    </button>
                  </>
                )}
              </div>
            ) : (
              filteredNotes.map(note => (
                <div
                  key={note.id}
                  className={[
                    'group relative border-b border-white/[0.04] transition-colors',
                    selectedId === note.id
                      ? 'bg-[#86efac]/[0.06] border-l-2 border-l-[#86efac]/40'
                      : 'hover:bg-white/[0.03]',
                  ].join(' ')}
                >
                  <button
                    type="button"
                    onClick={() => { setSelectedId(note.id); setShowEditor(true) }}
                    className="w-full px-4 py-3 text-left"
                  >
                    <div className="flex items-start gap-1.5">
                      {note.pinned && <span className="mt-0.5 text-[10px]">📌</span>}
                      <p className="flex-1 truncate text-sm font-medium text-white/80">{displayTitle(note)}</p>
                    </div>
                    <p className="mt-0.5 text-[10px] text-white/36">{formatRelative(note.updated_at)}</p>
                  </button>

                  {/* Pin button — visible on hover */}
                  <button
                    type="button"
                    title={note.pinned ? 'ピン解除' : 'ピン留め'}
                    onClick={e => { e.stopPropagation(); handlePinToggle(note.id, note.pinned) }}
                    className="absolute right-2 top-2.5 hidden rounded-md p-1 text-[11px] text-white/25 hover:text-white/70 group-hover:flex"
                  >
                    {note.pinned ? '📌' : '🔧'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Editor ──────────────────────────────────────────── */}
      {showEditor && selected ? (
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          {/* Editor header */}
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
            {isMobile && (
              <button type="button" onClick={() => setShowEditor(false)} className="text-xs text-white/40 hover:text-white/70 mr-1">
                ← 一覧
              </button>
            )}
            <p className="text-[10px] text-white/25 flex-1">テキスト選択でフォーマット　/でブロック挿入　画像はペースト or ドロップ</p>
            <button
              type="button"
              onClick={() => handlePinToggle(selected.id, selected.pinned)}
              title={selected.pinned ? 'ピン解除' : 'ピン留め'}
              className="rounded-lg px-2 py-1 text-[11px] text-white/30 hover:text-white/70 transition-colors"
            >
              {selected.pinned ? '📌' : '🔧'}
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="rounded-lg border border-white/[0.08] px-2.5 py-1 text-[10px] text-white/40 hover:border-white/[0.16] hover:text-white/70 transition-colors"
              title="Markdownとしてエクスポート"
            >
              ↓ .md
            </button>
            <button
              type="button"
              onClick={() => handleDelete(selected.id)}
              className="rounded-lg border border-red-500/10 px-2.5 py-1 text-[10px] text-red-400/50 hover:border-red-500/30 hover:text-red-400/80 transition-colors"
            >
              削除
            </button>
          </div>

          {/* Title */}
          <input
            type="text"
            value={localTitle}
            onChange={e => handleTitleChange(e.target.value)}
            placeholder="無題のノート"
            className="w-full bg-transparent px-6 py-5 text-xl font-bold text-white/90 placeholder:text-white/20 outline-none border-b border-white/[0.04]"
          />

          {/* Rich text editor */}
          <div className="flex-1 overflow-y-auto">
            <TiptapEditor
              content={localBody}
              onChange={handleBodyChange}
              onCharCount={(c, w) => { setCharCount(c); setWordCount(w) }}
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-white/[0.04] px-6 py-2">
            <p className="text-[10px] text-white/20">{formatRelative(selected.updated_at)} に更新</p>
            <p className="text-[10px] text-white/20">{charCount} 文字　{wordCount} 語</p>
          </div>
        </div>
      ) : (
        !showEditor && notes.length > 0 && (
          <div className="hidden flex-1 items-center justify-center lg:flex">
            <div className="text-center space-y-2">
              <p className="text-2xl text-white/10">✎</p>
              <p className="text-sm text-white/28">ノートを選択してください</p>
              <p className="text-[10px] text-white/18">または新規作成</p>
            </div>
          </div>
        )
      )}
    </div>
  )
}
