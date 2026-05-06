import { describe, expect, it } from 'vitest'
import { tiptapJsonToMarkdown } from '@/lib/notes/noteExport'

describe('tiptapJsonToMarkdown', () => {
  it('exports headings, marks, and task items', () => {
    const body = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Plan' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Important', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' note' },
          ],
        },
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: true },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Done' }] }],
            },
          ],
        },
      ],
    })

    expect(tiptapJsonToMarkdown(body)).toContain('## Plan')
    expect(tiptapJsonToMarkdown(body)).toContain('**Important** note')
    expect(tiptapJsonToMarkdown(body)).toContain('- [x] Done')
  })
})
