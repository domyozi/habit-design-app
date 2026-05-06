type TiptapNode = {
  type: string
  text?: string
  content?: TiptapNode[]
  attrs?: Record<string, unknown>
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

const markText = (text: string, marks: TiptapNode['marks']): string => {
  if (!marks) return text
  return marks.reduce((out, mark) => {
    if (mark.type === 'bold') return `**${out}**`
    if (mark.type === 'italic') return `*${out}*`
    if (mark.type === 'underline') return `<u>${out}</u>`
    if (mark.type === 'strike') return `~~${out}~~`
    if (mark.type === 'code') return `\`${out}\``
    if (mark.type === 'link') return `[${out}](${mark.attrs?.href ?? ''})`
    return out
  }, text)
}

export const tiptapJsonToMarkdown = (bodyJson: string): string => {
  const nodeToMd = (node: TiptapNode, opts: { ordered?: boolean; index?: number } = {}): string => {
    switch (node.type) {
      case 'doc':
        return (node.content ?? []).map((n) => nodeToMd(n)).join('\n')
      case 'paragraph':
        return `${(node.content ?? []).map((n) => nodeToMd(n)).join('')}\n`
      case 'text':
        return markText(node.text ?? '', node.marks)
      case 'heading': {
        const level = Number(node.attrs?.level ?? 1)
        return `${'#'.repeat(Math.max(1, Math.min(level, 6)))} ${(node.content ?? []).map((n) => nodeToMd(n)).join('')}\n`
      }
      case 'bulletList':
        return (node.content ?? []).map((n) => nodeToMd(n)).join('')
      case 'orderedList':
        return (node.content ?? []).map((n, i) => nodeToMd(n, { ordered: true, index: i + 1 })).join('')
      case 'listItem': {
        const prefix = opts.ordered ? `${opts.index ?? 1}. ` : '- '
        return `${prefix}${(node.content ?? []).map((n) => nodeToMd(n)).join('').trimEnd()}\n`
      }
      case 'taskList':
        return (node.content ?? []).map((n) => nodeToMd(n)).join('')
      case 'taskItem': {
        const checked = node.attrs?.checked ? 'x' : ' '
        return `- [${checked}] ${(node.content ?? []).map((n) => nodeToMd(n)).join('').trimEnd()}\n`
      }
      case 'codeBlock': {
        const language = typeof node.attrs?.language === 'string' ? node.attrs.language : ''
        const code = (node.content ?? []).map((n) => n.text ?? '').join('')
        return `\`\`\`${language}\n${code}\n\`\`\`\n`
      }
      case 'blockquote':
        return `${(node.content ?? []).map((n) => nodeToMd(n)).join('').split('\n').filter(Boolean).map((line) => `> ${line}`).join('\n')}\n`
      case 'horizontalRule':
        return '---\n'
      case 'image': {
        const src = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
        const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : 'image'
        return `![${alt}](${src.startsWith('data:') ? 'image' : src})\n`
      }
      case 'hardBreak':
        return '\n'
      default:
        return (node.content ?? []).map((n) => nodeToMd(n)).join('')
    }
  }

  if (!bodyJson) return ''
  try {
    return nodeToMd(JSON.parse(bodyJson) as TiptapNode)
  } catch {
    return bodyJson
  }
}

export const exportNoteToMarkdown = (title: string, bodyJson: string): void => {
  const safeTitle = title.trim() || 'Untitled note'
  const markdown = `# ${safeTitle}\n\n${tiptapJsonToMarkdown(bodyJson)}`
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${safeTitle.replace(/[/\\?%*:|"<>]/g, '-')}.md`
  anchor.click()
  URL.revokeObjectURL(url)
}
