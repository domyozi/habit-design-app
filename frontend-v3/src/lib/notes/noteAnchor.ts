export const generateBlockId = (): string =>
  `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export const buildBlockUrl = (noteId: string, blockId: string): string => {
  const base = `${window.location.origin}/notes`
  return `${base}?n=${encodeURIComponent(noteId)}#${encodeURIComponent(blockId)}`
}
