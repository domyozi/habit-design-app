export interface Note {
  id: string
  title: string
  body: string
  pinned: boolean
  order_index: number
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface CreateNoteInput {
  title?: string
  body?: string
  pinned?: boolean
  order_index?: number
}

export type UpdateNoteInput = Partial<Pick<Note, 'title' | 'body' | 'pinned' | 'order_index'>>

export const EMPTY_NOTE_DOC = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph' }],
})
