import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api'
import type { CreateNoteInput, Note, UpdateNoteInput } from '@/lib/notes/types'

export const listNotes = () => apiGet<Note[]>('/api/notes')

export const createNote = (body: CreateNoteInput) => apiPost<Note>('/api/notes', body)

export const updateNote = (id: string, body: UpdateNoteInput) =>
  apiPatch<Note>(`/api/notes/${id}`, body)

export const deleteNote = (id: string) => apiDelete<void>(`/api/notes/${id}`)
