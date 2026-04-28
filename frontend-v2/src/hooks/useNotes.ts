import { useState, useCallback, useEffect } from 'react'
import { useLocalStorage } from '@/lib/storage'
import { fetchNotes, createNoteApi, patchNoteApi, deleteNoteApi } from '@/lib/notes-api'

export interface Note {
  id: string
  title: string
  body: string
  order_index: number
  created_at: string
  updated_at: string
}

const genId = () =>
  `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const now = () => new Date().toISOString()

export const useNotes = () => {
  const [notes, setNotes] = useLocalStorage<Note[]>('notes:list', [])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Sync from API on mount
  useEffect(() => {
    fetchNotes()
      .then(records => {
        if (records.length > 0) {
          setNotes(records.map(r => ({
            id: r.id, title: r.title, body: r.body,
            order_index: r.order_index, created_at: r.created_at, updated_at: r.updated_at,
          })))
        }
      })
      .catch(() => {/* オフライン時はlocalStorageのまま */})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const createNote = useCallback((): Note => {
    const note: Note = {
      id: genId(),
      title: '',
      body: '',
      order_index: 0,
      created_at: now(),
      updated_at: now(),
    }
    setNotes(prev => [note, ...prev.map((n, i) => ({ ...n, order_index: i + 1 }))])
    setSelectedId(note.id)
    // Sync to API
    void createNoteApi(note).catch(() => {/* silent */})
    return note
  }, [setNotes])

  const updateNote = useCallback((id: string, patch: Partial<Pick<Note, 'title' | 'body'>>) => {
    setNotes(prev =>
      prev.map(n => n.id === id ? { ...n, ...patch, updated_at: now() } : n)
    )
    void patchNoteApi(id, patch).catch(() => {/* silent */})
  }, [setNotes])

  const deleteNote = useCallback((id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id))
    setSelectedId(prev => prev === id ? null : prev)
    void deleteNoteApi(id).catch(() => {/* silent */})
  }, [setNotes])

  const selected = notes.find(n => n.id === selectedId) ?? null

  return { notes, selected, selectedId, setSelectedId, createNote, updateNote, deleteNote }
}
