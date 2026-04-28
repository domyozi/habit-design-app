import { API_BASE_URL, getStoredAccessToken } from '@/lib/api'

export interface NoteRecord {
  id: string
  title: string
  body: string
  order_index: number
  created_at: string
  updated_at: string
}

const authHeaders = (): Record<string, string> => {
  const token = getStoredAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const fetchNotes = async (): Promise<NoteRecord[]> => {
  const res = await fetch(`${API_BASE_URL}/api/notes`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`GET /api/notes → ${res.status}`)
  return res.json() as Promise<NoteRecord[]>
}

export const createNoteApi = async (note: NoteRecord): Promise<NoteRecord> => {
  const res = await fetch(`${API_BASE_URL}/api/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(note),
  })
  if (!res.ok) throw new Error(`POST /api/notes → ${res.status}`)
  return res.json() as Promise<NoteRecord>
}

export const patchNoteApi = async (id: string, patch: Partial<Pick<NoteRecord, 'title' | 'body' | 'order_index'>>): Promise<NoteRecord> => {
  const res = await fetch(`${API_BASE_URL}/api/notes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`PATCH /api/notes/${id} → ${res.status}`)
  return res.json() as Promise<NoteRecord>
}

export const deleteNoteApi = async (id: string): Promise<void> => {
  await fetch(`${API_BASE_URL}/api/notes/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
}
