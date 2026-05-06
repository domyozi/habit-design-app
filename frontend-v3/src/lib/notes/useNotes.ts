import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createNote, deleteNote, listNotes, updateNote } from '@/lib/notes/notesApi'
import { EMPTY_NOTE_DOC, type CreateNoteInput, type Note, type UpdateNoteInput } from '@/lib/notes/types'

const STORAGE_KEY = 'daily.os.notes.v2'
// 同一ブラウザの複数タブ間で notes 状態を共有するチャンネル名。
// localStorage と key を揃え「同じ namespace の sync ペア」として運用する。
const BROADCAST_KEY = STORAGE_KEY
// visibility 復帰時の refetch を 10s でスロットルし、タブ切替の連打で API が叩かれるのを防ぐ。
const VISIBILITY_REFETCH_THROTTLE_MS = 10_000

interface BroadcastUpsert {
  type: 'upsert'
  note: Note
  sourceId: string
}
interface BroadcastDelete {
  type: 'delete'
  id: string
  sourceId: string
}
type BroadcastMessage = BroadcastUpsert | BroadcastDelete

const nowIso = () => new Date().toISOString()

const createLocalNote = (input: CreateNoteInput = {}): Note => ({
  id: `local-${crypto.randomUUID()}`,
  title: input.title ?? 'Untitled',
  body: input.body ?? EMPTY_NOTE_DOC,
  pinned: input.pinned ?? false,
  order_index: input.order_index ?? 0,
  created_at: nowIso(),
  updated_at: nowIso(),
  deleted_at: null,
})

const readLocalNotes = (): Note[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeLocalNotes = (notes: Note[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
}

const isNewer = (a: string | undefined, b: string | undefined): boolean => {
  if (!a) return false
  if (!b) return true
  return new Date(a).getTime() > new Date(b).getTime()
}

export function useNotes() {
  // Sprint notes-perf: 起動を体感即時にするため localStorage の cache を初期 state にする。
  // remote 取得は背景で走り、終わったら setNotes で上書き。これでエディタが即座に出る。
  const [notes, setNotes] = useState<Note[]>(() => readLocalNotes())
  const [loading, setLoading] = useState(() => readLocalNotes().length === 0)
  const [usingLocalFallback, setUsingLocalFallback] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Sprint notes-multitab: 別タブの編集で更新された note id 集合。NotesPage が
  // バッジ表示と「取り込み」UX に使う。自タブの編集ではセットしない。
  const [externalUpdateIds, setExternalUpdateIds] = useState<Set<string>>(() => new Set())

  // 最新 notes をコールバック内で参照するための ref（render 経由の stale 値を避ける）。
  const notesRef = useRef(notes)
  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  // BroadcastChannel と instance id（自分の broadcast を echo 受信したとき無視するため）。
  const channelRef = useRef<BroadcastChannel | null>(null)
  const instanceIdRef = useRef<string>('')
  const lastRemoteFetchAtRef = useRef<number>(0)

  if (!instanceIdRef.current) {
    instanceIdRef.current = crypto.randomUUID()
  }

  const markExternalUpdate = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    setExternalUpdateIds((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const id of ids) {
        if (!next.has(id)) {
          next.add(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [])

  const acknowledgeExternalUpdate = useCallback((id: string) => {
    setExternalUpdateIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  // 初回ロード
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const remote = await listNotes()
        if (cancelled) return
        setNotes(remote)
        writeLocalNotes(remote)
        lastRemoteFetchAtRef.current = Date.now()
        setUsingLocalFallback(false)
        setError(null)
      } catch (err) {
        if (cancelled) return
        const local = readLocalNotes()
        if (local.length === 0) {
          const initial = createLocalNote({
            title: 'Welcome to Notes',
            body: JSON.stringify({
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'ここに考えやメモを保存できます。' }],
                },
              ],
            }),
          })
          writeLocalNotes([initial])
          setNotes([initial])
        } else {
          setNotes(local)
        }
        setUsingLocalFallback(true)
        setError(err instanceof Error ? err.message : 'Notes API is unavailable')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // Sprint notes-cache-sync: notes が変わるたび localStorage を最新化する。
  // 以前は usingLocalFallback=true の時だけ書いていたため、API 成功時の編集が
  // キャッシュに反映されず、リロードで「古い → 新しい」のチラつきが発生していた。
  // 失敗フォールバック時の挙動も維持しつつ、常時 mirror で同期。
  useEffect(() => {
    // 初回ロード前（loading=true かつ notes 空）は書かない（前回キャッシュを上書きしないため）
    if (loading && notes.length === 0) return
    writeLocalNotes(notes)
  }, [notes, loading])

  // Sprint notes-multitab: 同一ブラウザの別タブからの更新を受信して state にマージ。
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(BROADCAST_KEY)
    channelRef.current = channel
    const myInstanceId = instanceIdRef.current
    channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
      const data = event.data
      if (!data || data.sourceId === myInstanceId) return
      if (data.type === 'upsert') {
        const incoming = data.note
        setNotes((current) => {
          const idx = current.findIndex((n) => n.id === incoming.id)
          if (idx === -1) return [incoming, ...current]
          // 既存 note より古いブロードキャストは無視（順序入れ替わり対策）
          const existing = current[idx]
          if (!isNewer(incoming.updated_at, existing.updated_at)) return current
          const next = current.slice()
          next[idx] = incoming
          return next
        })
        markExternalUpdate([incoming.id])
      } else if (data.type === 'delete') {
        setNotes((current) => current.filter((n) => n.id !== data.id))
      }
    }
    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [markExternalUpdate])

  const broadcast = useCallback((message: Omit<BroadcastUpsert, 'sourceId'> | Omit<BroadcastDelete, 'sourceId'>) => {
    const channel = channelRef.current
    if (!channel) return
    channel.postMessage({ ...message, sourceId: instanceIdRef.current } as BroadcastMessage)
  }, [])

  // Sprint notes-multitab: visibility 復帰時に listNotes() を再呼び出し。
  // クロスデバイス／クロスブラウザの更新を遅延ながら拾う最低限のセーフティネット。
  // BroadcastChannel が拾えない経路（別端末・別ブラウザ）はこちらで補完する。
  useEffect(() => {
    const onVisibility = async () => {
      if (document.visibilityState !== 'visible') return
      if (usingLocalFallback) return
      const now = Date.now()
      if (now - lastRemoteFetchAtRef.current < VISIBILITY_REFETCH_THROTTLE_MS) return
      lastRemoteFetchAtRef.current = now
      try {
        const remote = await listNotes()
        const localById = new Map(notesRef.current.map((n) => [n.id, n]))
        const externalIds: string[] = []
        for (const r of remote) {
          const local = localById.get(r.id)
          if (local && isNewer(r.updated_at, local.updated_at)) {
            externalIds.push(r.id)
          }
        }
        setNotes(remote)
        markExternalUpdate(externalIds)
      } catch {
        // 一時的なエラーは静かに無視（次回 visibility で再試行）。
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [markExternalUpdate, usingLocalFallback])

  // Sort by pinned → order_index → created_at (stable). updated_at は使わない:
  // 編集のたびに updated_at が変わると active なノートがサイドバー内で「飛ぶ」ため。
  // created_at は不変なので、編集中でも順序が固定される。
  const sortedNotes = useMemo(
    () =>
      [...notes].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        if (a.order_index !== b.order_index) return a.order_index - b.order_index
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }),
    [notes],
  )

  const addNote = useCallback(async (input: CreateNoteInput = {}) => {
    const draft = createLocalNote(input)
    setNotes((current) => [draft, ...current])
    if (usingLocalFallback) return draft

    try {
      const saved = await createNote({
        title: draft.title,
        body: draft.body,
        pinned: draft.pinned,
        order_index: draft.order_index,
      })
      setNotes((current) => current.map((note) => (note.id === draft.id ? saved : note)))
      broadcast({ type: 'upsert', note: saved })
      return saved
    } catch (err) {
      setUsingLocalFallback(true)
      setError(err instanceof Error ? err.message : 'Failed to create note')
      return draft
    }
  }, [usingLocalFallback, broadcast])

  const patchNote = useCallback(async (id: string, input: UpdateNoteInput) => {
    let previous: Note | undefined
    setNotes((current) =>
      current.map((note) => {
        if (note.id !== id) return note
        previous = note
        return { ...note, ...input, updated_at: nowIso() }
      }),
    )
    if (usingLocalFallback || id.startsWith('local-')) return

    try {
      const saved = await updateNote(id, input)
      // 成功時に body/title/pinned を再マージしない:
      // API 往復中にユーザーが追加で typing していると、stale な input で巻き戻る。
      // ただし updated_at だけは server 採番値で同期する。これがないと visibility refetch が
      // 「自分の編集で進んだ server の updated_at」を「外部更新」と誤検知してバッジが出る。
      if (saved?.updated_at) {
        const serverUpdatedAt = saved.updated_at
        setNotes((current) =>
          current.map((note) =>
            note.id === id && isNewer(serverUpdatedAt, note.updated_at)
              ? { ...note, updated_at: serverUpdatedAt }
              : note,
          ),
        )
        // broadcast には server の updated_at を使い、他タブの isNewer 判定が安定するようにする。
        // body/title は state の最新（自タブの最終 typing 値）をベースに送る。
        const latest = notesRef.current.find((n) => n.id === id)
        if (latest) {
          broadcast({ type: 'upsert', note: { ...latest, ...input, updated_at: serverUpdatedAt } })
        }
      }
    } catch (err) {
      if (previous) setNotes((current) => current.map((note) => (note.id === id ? previous! : note)))
      setError(err instanceof Error ? err.message : 'Failed to update note')
    }
  }, [usingLocalFallback, broadcast])

  const removeNote = useCallback(async (id: string) => {
    let removed: Note | undefined
    setNotes((current) => current.filter((note) => {
      if (note.id === id) removed = note
      return note.id !== id
    }))
    if (usingLocalFallback || id.startsWith('local-')) return

    try {
      await deleteNote(id)
      broadcast({ type: 'delete', id })
    } catch (err) {
      if (removed) setNotes((current) => [removed!, ...current])
      setError(err instanceof Error ? err.message : 'Failed to delete note')
    }
  }, [usingLocalFallback, broadcast])

  return {
    notes: sortedNotes,
    loading,
    error,
    usingLocalFallback,
    addNote,
    patchNote,
    removeNote,
    externalUpdateIds,
    acknowledgeExternalUpdate,
  }
}
