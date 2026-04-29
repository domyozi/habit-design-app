// Convert Tiptap JSON to Markdown

type TiptapNode = {
  type: string
  text?: string
  content?: TiptapNode[]
  attrs?: Record<string, unknown>
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

const markText = (text: string, marks: TiptapNode['marks']): string => {
  if (!marks) return text
  let out = text
  for (const mark of marks) {
    if (mark.type === 'bold') out = `**${out}**`
    else if (mark.type === 'italic') out = `*${out}*`
    else if (mark.type === 'underline') out = `<u>${out}</u>`
    else if (mark.type === 'strike') out = `~~${out}~~`
    else if (mark.type === 'code') out = `\`${out}\``
    else if (mark.type === 'link') out = `[${out}](${mark.attrs?.href ?? ''})`
  }
  return out
}

const nodeToMd = (node: TiptapNode, opts: { ordered?: boolean; index?: number } = {}): string => {
  switch (node.type) {
    case 'doc':
      return (node.content ?? []).map(n => nodeToMd(n)).join('\n')

    case 'paragraph':
      return (node.content ?? []).map(n => nodeToMd(n)).join('') + '\n'

    case 'text':
      return markText(node.text ?? '', node.marks)

    case 'heading': {
      const level = (node.attrs?.level as number) ?? 1
      const prefix = '#'.repeat(level)
      const inner = (node.content ?? []).map(n => nodeToMd(n)).join('')
      return `${prefix} ${inner}\n`
    }

    case 'bulletList':
      return (node.content ?? []).map(n => nodeToMd(n, { ordered: false })).join('')

    case 'orderedList':
      return (node.content ?? []).map((n, i) => nodeToMd(n, { ordered: true, index: i + 1 })).join('')

    case 'listItem': {
      const prefix = opts.ordered ? `${opts.index ?? 1}. ` : '- '
      const inner = (node.content ?? []).map(n => nodeToMd(n)).join('').trimEnd()
      return `${prefix}${inner}\n`
    }

    case 'taskList':
      return (node.content ?? []).map(n => nodeToMd(n)).join('')

    case 'taskItem': {
      const checked = node.attrs?.checked ? 'x' : ' '
      const inner = (node.content ?? []).map(n => nodeToMd(n)).join('').trimEnd()
      return `- [${checked}] ${inner}\n`
    }

    case 'codeBlock': {
      const lang = (node.attrs?.language as string) ?? ''
      const code = (node.content ?? []).map(n => n.text ?? '').join('')
      return `\`\`\`${lang}\n${code}\n\`\`\`\n`
    }

    case 'blockquote': {
      const inner = (node.content ?? []).map(n => nodeToMd(n)).join('')
      return inner.split('\n').map(l => `> ${l}`).join('\n').trimEnd() + '\n'
    }

    case 'horizontalRule':
      return '---\n'

    case 'image': {
      const src = node.attrs?.src as string ?? ''
      const alt = node.attrs?.alt as string ?? 'image'
      // base64 images in markdown are not standard, just note the alt
      if (src.startsWith('data:')) return `![${alt}](image)\n`
      return `![${alt}](${src})\n`
    }

    case 'hardBreak':
      return '\n'

    default:
      return (node.content ?? []).map(n => nodeToMd(n)).join('')
  }
}

export const exportToMarkdown = (title: string, bodyJson: string): void => {
  let md = ''
  if (title) md += `# ${title}\n\n`
  if (bodyJson) {
    try {
      const doc = JSON.parse(bodyJson) as TiptapNode
      md += nodeToMd(doc)
    } catch {
      md += bodyJson
    }
  }

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(title || '無題のノート').replace(/[/\\?%*:|"<>]/g, '-')}.md`
  a.click()
  URL.revokeObjectURL(url)
}
