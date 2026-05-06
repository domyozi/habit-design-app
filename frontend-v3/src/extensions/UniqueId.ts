import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { generateBlockId } from '@/lib/notes/noteAnchor'

interface UniqueIdOptions {
  types: string[]
  attributeName: string
}

const PLUGIN_KEY = new PluginKey('uniqueIdAppender')

export const UniqueId = Extension.create<UniqueIdOptions>({
  name: 'uniqueId',

  addOptions() {
    return {
      types: ['paragraph', 'heading', 'taskItem', 'listItem', 'codeBlock', 'blockquote', 'image', 'horizontalRule'],
      attributeName: 'id',
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          [this.options.attributeName]: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute('id') ?? element.getAttribute('data-id'),
            renderHTML: (attrs: Record<string, unknown>) => {
              const value = attrs[this.options.attributeName]
              if (!value) return {}
              return { id: String(value), 'data-id': String(value) }
            },
          },
        },
      },
    ]
  },

  addProseMirrorPlugins() {
    const types = new Set(this.options.types)
    const attrName = this.options.attributeName

    return [
      new Plugin({
        key: PLUGIN_KEY,
        appendTransaction: (transactions, _oldState, newState) => {
          const docChanged = transactions.some((tr) => tr.docChanged)
          const isInit = transactions.some((tr) => tr.getMeta('uniqueId-init'))
          if (!docChanged && !isInit) return null

          const seen = new Set<string>()
          const updates: Array<{ pos: number; id: string }> = []
          newState.doc.descendants((node, pos) => {
            if (!types.has(node.type.name)) return true
            const current = node.attrs[attrName] as string | null | undefined
            if (!current || seen.has(current)) updates.push({ pos, id: generateBlockId() })
            else seen.add(current)
            return true
          })

          if (updates.length === 0) return null
          let tr = newState.tr
          for (const { pos, id } of updates) {
            const node = tr.doc.nodeAt(pos)
            if (node) tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, [attrName]: id })
          }
          return tr.setMeta('addToHistory', false).setMeta('uniqueId/silent', true)
        },
        view: (editorView) => {
          queueMicrotask(() => {
            if (editorView.isDestroyed) return
            editorView.dispatch(
              editorView.state.tr
                .setMeta('uniqueId-init', true)
                .setMeta('uniqueId/silent', true)
                .setMeta('addToHistory', false),
            )
          })
          return {}
        },
      }),
    ]
  },
})
