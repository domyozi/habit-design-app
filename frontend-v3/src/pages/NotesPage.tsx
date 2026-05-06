import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Theme } from '@/lib/theme'
import { MonoLabel } from '@/components/today/MonoLabel'
import { TiptapEditor } from '@/components/notes/TiptapEditor'
import { useNotes } from '@/lib/notes/useNotes'
import { EMPTY_NOTE_DOC, type Note, type UpdateNoteInput } from '@/lib/notes/types'
import { exportNoteToMarkdown } from '@/lib/notes/noteExport'
import { LoadingPulse } from '@/components/ui/Skeleton'

interface Props {
  theme: Theme
}

const formatUpdated = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const noteSummary = (note: Note) => {
  if (!note.body) return 'No content'
  try {
    const doc = JSON.parse(note.body) as { content?: Array<{ content?: Array<{ text?: string }> }> }
    const text = doc.content?.flatMap((node) => node.content ?? []).map((child) => child.text ?? '').join(' ').trim()
    return text || 'No content'
  } catch {
    return note.body.slice(0, 80)
  }
}

export default function NotesPage({ theme: t }: Props) {
  const {
    notes,
    loading,
    error,
    usingLocalFallback,
    addNote,
    patchNote,
    removeNote,
    externalUpdateIds,
    acknowledgeExternalUpdate,
  } = useNotes()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftBody, setDraftBody] = useState(EMPTY_NOTE_DOC)

  useEffect(() => {
    const paramId = new URLSearchParams(window.location.search).get('n')
    if (paramId && notes.some((note) => note.id === paramId)) {
      setActiveId(paramId)
      return
    }
    if (!activeId && notes[0]) setActiveId(notes[0].id)
    if (activeId && !notes.some((note) => note.id === activeId)) setActiveId(notes[0]?.id ?? null)
  }, [activeId, notes])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return notes
    return notes.filter((note) => `${note.title} ${noteSummary(note)}`.toLowerCase().includes(q))
  }, [notes, query])

  const active = notes.find((note) => note.id === activeId) ?? notes[0] ?? null
  const pinned = filtered.filter((note) => note.pinned)
  const recent = filtered.filter((note) => !note.pinned)

  // ノート切替時のみ draft を external で初期化する。
  // 同じノート ID の間は editor (draftBody/draftTitle) が真実とし、サーバ起源の更新で
  // 上書きしない。これにより API 往復で stale な値が editor に反映される事故を防ぐ。
  // （初期ロードや別ノート選択時は active.id が変わるので問題なく同期される）
  const lastActiveIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!active) {
      setDraftTitle('')
      setDraftBody(EMPTY_NOTE_DOC)
      lastActiveIdRef.current = null
      return
    }
    if (lastActiveIdRef.current !== active.id) {
      setDraftTitle(active.title)
      setDraftBody(active.body || EMPTY_NOTE_DOC)
      lastActiveIdRef.current = active.id
      // 別ノートに切替えた瞬間、新ノートの外部更新フラグは「draft 初期化で吸収済」なのでクリア。
      if (externalUpdateIds.has(active.id)) acknowledgeExternalUpdate(active.id)
    }
  }, [active, externalUpdateIds, acknowledgeExternalUpdate])

  // pendingPatchRef: note id → 未送信の draft フィールド。
  // 入力ハンドラで毎キー更新し、debounce 発火時に該当フィールドをクリア。
  // ノート切替時に「old note の未送信分」を強制 flush することで、
  // 「typing → 即別ノートクリック」で内容がロストする問題を防ぐ。
  const pendingPatchRef = useRef<Map<string, UpdateNoteInput>>(new Map())
  const prevActiveIdRef = useRef<string | null>(null)

  const stagePending = useCallback((id: string, fields: UpdateNoteInput) => {
    const current = pendingPatchRef.current.get(id) ?? {}
    pendingPatchRef.current.set(id, { ...current, ...fields })
  }, [])

  const clearPendingField = useCallback((id: string, field: keyof UpdateNoteInput, value: unknown) => {
    const pending = pendingPatchRef.current.get(id)
    if (!pending || pending[field] !== value) return
    const { [field]: _drop, ...rest } = pending
    if (Object.keys(rest).length === 0) pendingPatchRef.current.delete(id)
    else pendingPatchRef.current.set(id, rest)
  }, [])

  const handleTitleChange = useCallback((value: string) => {
    setDraftTitle(value)
    if (active) stagePending(active.id, { title: value })
  }, [active, stagePending])

  const handleBodyChange = useCallback((value: string) => {
    setDraftBody(value)
    if (active) stagePending(active.id, { body: value })
  }, [active, stagePending])

  useEffect(() => {
    if (!active || draftTitle === active.title) return
    // Sprint notes-multitab: 別タブの更新が pending の間は debounce を抑止する。
    // そのまま patch を飛ばすと server 側に「broadcast 前の自タブ draft」を書き戻し、
    // 取り込み前に broadcast 値が消える。バッジで user に解決を委ねるまで止める。
    if (externalUpdateIds.has(active.id)) return
    const id = active.id
    const value = draftTitle
    const timer = window.setTimeout(() => {
      void patchNote(id, { title: value })
      clearPendingField(id, 'title', value)
    }, 450)
    return () => window.clearTimeout(timer)
  }, [active, draftTitle, patchNote, clearPendingField, externalUpdateIds])

  useEffect(() => {
    if (!active || draftBody === (active.body || EMPTY_NOTE_DOC)) return
    if (externalUpdateIds.has(active.id)) return
    const id = active.id
    const value = draftBody
    const timer = window.setTimeout(() => {
      void patchNote(id, { body: value })
      clearPendingField(id, 'body', value)
    }, 650)
    return () => window.clearTimeout(timer)
  }, [active, draftBody, patchNote, clearPendingField, externalUpdateIds])

  // ノート切替検知 → 旧ノートの pending を即時 flush。
  // typing → 即別ノートクリックで debounce timer がキャンセルされ、入力内容が失われる
  // 既知の事象に対するセーフティネット。
  useEffect(() => {
    const prevId = prevActiveIdRef.current
    const currentId = active?.id ?? null
    if (prevId && prevId !== currentId) {
      const pending = pendingPatchRef.current.get(prevId)
      if (pending && Object.keys(pending).length > 0) {
        void patchNote(prevId, pending)
      }
      pendingPatchRef.current.delete(prevId)
    }
    prevActiveIdRef.current = currentId
  }, [active?.id, patchNote])

  const create = async () => {
    const note = await addNote({ title: 'Untitled', body: EMPTY_NOTE_DOC })
    setActiveId(note.id)
    window.history.replaceState(null, '', `/notes?n=${encodeURIComponent(note.id)}`)
  }

  // Sprint notes-multitab: 別タブで更新が入った active note を、ローカル draft を捨てて
  // server 側に揃える。pendingPatchRef も削除して stale 値の patch が飛ばないようにする。
  const adoptExternalUpdate = useCallback(() => {
    if (!active) return
    const hasPending = pendingPatchRef.current.has(active.id)
    if (hasPending && !window.confirm('別タブの更新を取り込みます。このタブの未保存編集は破棄されます。よろしいですか？')) {
      return
    }
    setDraftTitle(active.title)
    setDraftBody(active.body || EMPTY_NOTE_DOC)
    pendingPatchRef.current.delete(active.id)
    acknowledgeExternalUpdate(active.id)
  }, [active, acknowledgeExternalUpdate])

  // 未保存の編集が無いタブでは external 更新を即座に draft に取り込む（badge を出さず吸収）。
  // これがないと、user が触っていないタブでも debounce useEffect が draft を保持して
  // 「typed: 旧値」で patch を飛ばし、せっかくの external 更新が巻き戻る。
  useEffect(() => {
    if (!active || !externalUpdateIds.has(active.id)) return
    if (pendingPatchRef.current.has(active.id)) return
    setDraftTitle(active.title)
    setDraftBody(active.body || EMPTY_NOTE_DOC)
    acknowledgeExternalUpdate(active.id)
  }, [active, externalUpdateIds, acknowledgeExternalUpdate])


  const select = (id: string) => {
    setActiveId(id)
    window.history.replaceState(null, '', `/notes?n=${encodeURIComponent(id)}`)
  }

  const sidebarButton = (note: Note) => {
    const selected = active?.id === note.id
    return (
      <button
        key={note.id}
        type="button"
        onClick={() => select(note.id)}
        style={{
          width: '100%',
          padding: '12px 16px 12px 13px',
          border: 'none',
          borderTop: `1px solid ${t.ink06}`,
          // Active note は accent 左端ストライプ + 濃い paperWarm 背景で明確に区別。
          borderLeft: selected ? `3px solid ${t.accent}` : '3px solid transparent',
          background: selected ? `${t.accent}14` : 'transparent',
          color: t.ink,
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {note.title.trim() || 'Untitled'}
          </span>
          {note.pinned && <span style={{ color: t.accent, fontSize: 12 }}>●</span>}
        </div>
        <div
          style={{
            marginTop: 4,
            color: t.ink50,
            fontSize: 11,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {noteSummary(note)}
        </div>
        <div style={{ marginTop: 6, color: t.ink30, fontFamily: t.mono, fontSize: 9, letterSpacing: '0.1em' }}>
          {formatUpdated(note.updated_at)}
        </div>
      </button>
    )
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateColumns: '300px minmax(0, 1fr)',
        minHeight: 0,
        background: t.paper,
      }}
    >
      <aside
        style={{
          minHeight: 0,
          overflow: 'auto',
          borderRight: `1px solid ${t.ink12}`,
          background: t.paperWarm,
        }}
      >
        <div style={{ padding: '18px 18px 14px', borderBottom: `1px solid ${t.ink12}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1, fontWeight: 800 }}>Notes</h1>
            <button
              type="button"
              onClick={create}
              style={{
                border: `1px solid ${t.ink}`,
                background: t.ink,
                color: t.paper,
                padding: '8px 12px',
                fontFamily: t.mono,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.16em',
                cursor: 'pointer',
              }}
            >
              + NEW
            </button>
          </div>
          <div style={{ marginTop: 14 }}>
            <input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search notes..."
              style={{
                width: '100%',
                height: 36,
                padding: '0 10px',
                border: `1px solid ${t.ink12}`,
                background: t.paper,
                color: t.ink,
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>
          {(usingLocalFallback || error) && (
            <div style={{ marginTop: 10, color: t.ink50, fontFamily: t.mono, fontSize: 9, letterSpacing: '0.08em' }}>
              {usingLocalFallback ? 'LOCAL FALLBACK' : 'SYNC ISSUE'}
            </div>
          )}
        </div>

        {loading && (
          <div style={{ padding: 18 }}>
            <LoadingPulse label="読み込み中" />
          </div>
        )}
        {!loading && pinned.length > 0 && (
          <>
            <div style={{ padding: '14px 16px 6px' }}><MonoLabel theme={t}>PINNED</MonoLabel></div>
            {pinned.map(sidebarButton)}
          </>
        )}
        {!loading && (
          <>
            <div style={{ padding: '14px 16px 6px' }}><MonoLabel theme={t}>RECENT</MonoLabel></div>
            {recent.map(sidebarButton)}
            {filtered.length === 0 && <div style={{ padding: 18, color: t.ink50, fontSize: 13 }}>No notes found.</div>}
          </>
        )}
      </aside>

      <main style={{ minWidth: 0, minHeight: 0, overflow: 'auto' }}>
        {active ? (
          // Sprint notes-layout: ツールバーだけ画面端まで広げるため、外側は padding なし。
          // タイトル行と本文には個別に padding を入れる。toolbar は full-width で
          // sticky の意図通り「メニューバー」として横いっぱいに見える。
          <div style={{ minHeight: '100%' }} className="notes-content-shell">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 40px 8px' }}>
              <input
                value={draftTitle}
                onChange={(event) => handleTitleChange(event.currentTarget.value)}
                placeholder="Untitled"
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: 'none',
                  background: 'transparent',
                  color: t.ink,
                  fontSize: 26,
                  fontWeight: 800,
                  outline: 'none',
                }}
              />
              {externalUpdateIds.has(active.id) && (
                <button
                  type="button"
                  onClick={adoptExternalUpdate}
                  title="別タブで更新がありました。クリックで取り込みます。"
                  style={{
                    border: `1px solid ${t.accent}`,
                    background: t.accent,
                    color: t.paper,
                    padding: '8px 10px',
                    fontFamily: t.mono,
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: '0.14em',
                    cursor: 'pointer',
                  }}
                >
                  ⟳ EXTERNAL UPDATE
                </button>
              )}
              <button type="button" onClick={() => void patchNote(active.id, { pinned: !active.pinned })} style={actionStyle(t, active.pinned)}>
                PIN
              </button>
              <button type="button" onClick={() => exportNoteToMarkdown(active.title, active.body)} style={actionStyle(t)}>
                EXPORT
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Delete this note?')) void removeNote(active.id)
                }}
                style={actionStyle(t)}
              >
                DELETE
              </button>
            </div>
            {/* TiptapEditor 内部の toolbar は full-width、本文は CSS 側で side padding を持たせる。 */}
            <TiptapEditor
              key={active.id}
              noteId={active.id}
              value={draftBody}
              onChange={handleBodyChange}
            />
          </div>
        ) : (
          <div style={{ padding: 36, color: t.ink50 }}>Create a note to start.</div>
        )}
      </main>
    </div>
  )
}

const actionStyle = (t: Theme, active = false): CSSProperties => ({
  border: `1px solid ${active ? t.accent : t.ink12}`,
  background: active ? t.paperWarm : t.paper,
  color: active ? t.accent : t.ink,
  padding: '8px 10px',
  fontFamily: t.mono,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.14em',
  cursor: 'pointer',
})
