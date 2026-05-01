import { useState, useEffect, useRef, useCallback } from 'react'
import { TiptapEditor } from '@/components/editor/TiptapEditor'
import { useNotes } from '@/hooks/useNotes'
import { exportToMarkdown } from '@/lib/note-export'
import { fetchDailyLog, fetchDailyLogDates, type DailyLogData } from '@/lib/api'

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

const formatDateLabel = (iso: string): string => {
  const d = new Date(iso)
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}（${weekdays[d.getDay()]}）`
}

// ── Daily Log View ──────────────────────────────────────────────────────
function DailySection({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-center border-l-2 px-4 py-2 mb-2" style={{ borderColor: color }}>
        <span className="text-xs font-semibold uppercase tracking-[0.20em]" style={{ color }}>
          {title}
        </span>
      </div>
      <div className="border-y border-white/[0.05] bg-[#111827]/70 px-4 py-3">
        {children}
      </div>
    </div>
  )
}

function DailyLogView() {
  const [dates, setDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [log, setLog] = useState<DailyLogData | null>(null)
  const [loading, setLoading] = useState(false)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024
  const [showDetail, setShowDetail] = useState(false)

  useEffect(() => {
    fetchDailyLogDates().then(d => {
      setDates(d)
      if (d.length > 0) setSelectedDate(d[0])
    })
  }, [])

  useEffect(() => {
    if (!selectedDate) return
    setLoading(true)
    fetchDailyLog(selectedDate).then(data => {
      setLog(data)
      setLoading(false)
      if (isMobile) setShowDetail(true)
    })
  }, [selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // スナップショットを解析（日付別に保存された AI メモリ）
  const snapshotCtx = (() => {
    if (!log?.user_context_snapshot) return null
    try { return JSON.parse(log.user_context_snapshot) as import('@/lib/api').UserContext }
    catch { return null }
  })()

  const hasMemory = snapshotCtx && (
    snapshotCtx.identity || snapshotCtx.patterns ||
    (snapshotCtx.values_keywords?.length ?? 0) > 0 ||
    Object.keys(snapshotCtx.insights ?? {}).length > 0
  )

  const hasAnyContent = log && (
    log.morning_journal || log.morning_feedback ||
    log.evening_notes || log.evening_feedback
  )

  return (
    <div className="flex h-full min-h-[calc(100svh-64px)] flex-col lg:flex-row">
      {/* Date sidebar */}
      {(!showDetail || !isMobile) && (
        <div className="flex w-full flex-col border-b border-white/[0.06] lg:w-64 lg:min-w-[240px] lg:border-b-0 lg:border-r">
          <div className="flex-1 overflow-y-auto">
            {dates.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                <span className="text-3xl text-white/10">📅</span>
                <p className="text-sm text-white/36">記録がありません</p>
                <p className="text-[10px] text-white/22">Morning / Evening を使うと自動で記録されます</p>
              </div>
            ) : (
              dates.map(date => (
                <button
                  key={date}
                  type="button"
                  onClick={() => setSelectedDate(date)}
                  className={[
                    'w-full border-b border-white/[0.04] px-4 py-3.5 text-left transition-colors',
                    selectedDate === date
                      ? 'bg-[#7dd3fc]/[0.06] border-l-2 border-l-[#7dd3fc]/40'
                      : 'hover:bg-white/[0.03]',
                  ].join(' ')}
                >
                  <p className="text-sm font-medium text-white/80">{formatDateLabel(date)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Detail panel */}
      {(!isMobile || showDetail) && (
        <div className="flex flex-1 flex-col min-w-0 overflow-y-auto">
          {isMobile && (
            <button
              type="button"
              onClick={() => setShowDetail(false)}
              className="px-4 py-3 text-xs text-white/40 hover:text-white/70 text-left border-b border-white/[0.06]"
            >
              ← 一覧
            </button>
          )}

          {!selectedDate ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-white/28">日付を選択してください</p>
            </div>
          ) : loading ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-[#7dd3fc]/60" />
            </div>
          ) : (
            <div className="px-0 py-4">
              {/* Date heading */}
              <div className="px-4 pb-4 border-b border-white/[0.06] mb-4">
                <h2 className="text-xl font-bold text-white/88">{formatDateLabel(selectedDate)}</h2>
              </div>

              {!hasAnyContent && !hasMemory ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                  <span className="text-3xl text-white/10">📝</span>
                  <p className="text-sm text-white/36">この日の記録はありません</p>
                </div>
              ) : (
                <>
                  {log?.morning_journal && (
                    <DailySection title="モーニングジャーナル" color="#86efac">
                      <p className="text-sm leading-relaxed text-white/80 whitespace-pre-wrap">{log.morning_journal}</p>
                    </DailySection>
                  )}

                  {log?.evening_notes && (
                    <DailySection title="夜の振り返り" color="#7dd3fc">
                      <p className="text-sm leading-relaxed text-white/80 whitespace-pre-wrap">{log.evening_notes}</p>
                    </DailySection>
                  )}

                  {log?.evening_feedback && (
                    <DailySection title="フィードバック" color="#c4b5fd">
                      <p className="text-sm leading-relaxed text-white/80 whitespace-pre-wrap">{log.evening_feedback}</p>
                    </DailySection>
                  )}

                  {hasMemory && snapshotCtx && (
                    <DailySection title="今日、僕（AI）が学んだきみのこと" color="#f9a8d4">
                      <div className="space-y-3 text-sm text-white/76">
                        {snapshotCtx.identity && (
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-white/36 mb-1">Identity</p>
                            <p className="leading-relaxed whitespace-pre-wrap">{snapshotCtx.identity}</p>
                          </div>
                        )}
                        {snapshotCtx.patterns && (
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-white/36 mb-1">Patterns</p>
                            <p className="leading-relaxed whitespace-pre-wrap">{snapshotCtx.patterns}</p>
                          </div>
                        )}
                        {(snapshotCtx.values_keywords?.length ?? 0) > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-white/36 mb-1">Values</p>
                            <div className="flex flex-wrap gap-1.5">
                              {snapshotCtx.values_keywords!.map(kw => (
                                <span key={kw} className="rounded-full border border-[#f9a8d4]/20 bg-[#f9a8d4]/10 px-2.5 py-0.5 text-[11px] text-[#f9a8d4]/80">
                                  {kw}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {Object.keys(snapshotCtx.insights ?? {}).length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-white/36 mb-1">Insights</p>
                            <div className="space-y-1">
                              {Object.entries(snapshotCtx.insights!).map(([k, v]) => (
                                <p key={k} className="leading-relaxed"><span className="text-white/40">{k}:</span> {String(v)}</p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </DailySection>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Notes (free-form) View ──────────────────────────────────────────────
function FreeNotesView() {
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

  const displayTitle = (note: { title: string }) => note.title.trim() || '無題のノート'

  const filteredNotes = query.trim()
    ? notes.filter(n =>
        n.title.toLowerCase().includes(query.toLowerCase()) ||
        n.body.toLowerCase().includes(query.toLowerCase())
      )
    : notes

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024

  return (
    <div className="flex h-full min-h-[calc(100svh-64px)] flex-col lg:flex-row">
      {(!showEditor || !isMobile) && (
        <div className="flex w-full flex-col border-b border-white/[0.06] lg:w-64 lg:min-w-[240px] lg:border-b-0 lg:border-r">
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

      {showEditor && selected ? (
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          {isMobile && (
            <button type="button" onClick={() => setShowEditor(false)} className="border-b border-white/[0.06] px-4 py-2 text-xs text-white/40 hover:text-white/70 text-left">
              ← 一覧
            </button>
          )}
          <div className="flex-1 overflow-y-auto">
            <TiptapEditor
              content={localBody}
              onChange={handleBodyChange}
              onCharCount={(c, w) => { setCharCount(c); setWordCount(w) }}
              headerSlot={
                <input
                  type="text"
                  value={localTitle}
                  onChange={e => handleTitleChange(e.target.value)}
                  placeholder="無題のノート"
                  className="w-full bg-transparent px-6 py-5 text-xl font-bold text-white/90 placeholder:text-white/20 outline-none border-b border-white/[0.04]"
                />
              }
              actionsSlot={
                <>
                  <button
                    type="button"
                    onMouseDown={e => { e.preventDefault(); handlePinToggle(selected.id, selected.pinned) }}
                    title={selected.pinned ? 'ピン解除' : 'ピン留め'}
                    className="flex h-7 items-center justify-center rounded px-1.5 text-xs text-white/40 hover:bg-white/10 hover:text-white/70 transition-colors select-none"
                  >
                    {selected.pinned ? '📌' : '🔧'}
                  </button>
                  <button
                    type="button"
                    onMouseDown={e => { e.preventDefault(); handleExport() }}
                    title="Markdownとしてエクスポート"
                    className="flex h-7 items-center justify-center rounded px-2 text-[10px] text-white/40 hover:bg-white/10 hover:text-white/70 transition-colors select-none border border-white/[0.08]"
                  >
                    ↓ .md
                  </button>
                  <button
                    type="button"
                    onMouseDown={e => { e.preventDefault(); handleDelete(selected.id) }}
                    className="flex h-7 items-center justify-center rounded px-2 text-[10px] text-red-400/50 hover:bg-red-500/10 hover:text-red-400/80 transition-colors select-none border border-red-500/10"
                  >
                    削除
                  </button>
                </>
              }
            />
          </div>
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

// ── NotesPage (tab container) ───────────────────────────────────────────
type PageTab = 'daily' | 'notes'

export function NotesPage() {
  const [pageTab, setPageTab] = useState<PageTab>('daily')

  return (
    <div className="flex h-full flex-col">
      {/* Tab toggle */}
      <div className="flex border-b border-white/[0.06] px-4 gap-1 pt-1">
        {(['daily', 'notes'] as PageTab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setPageTab(t)}
            className={[
              'px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors border-b-2 -mb-px',
              pageTab === t
                ? 'border-[#7dd3fc] text-[#7dd3fc]'
                : 'border-transparent text-white/36 hover:text-white/60',
            ].join(' ')}
          >
            {t === 'daily' ? 'Daily' : 'Notes'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {pageTab === 'daily' ? <DailyLogView /> : <FreeNotesView />}
      </div>
    </div>
  )
}
