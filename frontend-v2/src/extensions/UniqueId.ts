/**
 * TipTap 拡張: 対象ブロックノードに `id` 属性を自動付与する。
 * - parseHTML 時は `id` または `data-id` 属性のどちらでも吸う
 * - renderHTML 時は `id` と `data-id` 両方を出す（getElementById で引きやすくする）
 * - appendTransaction で「未割当」「複製コピペで重複」のブロックに新規 ID を採番
 *
 * Notes アンカーリンク機能用。生成 ID は `generateBlockId()` を使用。
 */

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { generateBlockId } from '@/lib/note-anchor'

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
            parseHTML: (element: HTMLElement) =>
              element.getAttribute('id') ?? element.getAttribute('data-id'),
            renderHTML: (attrs: Record<string, unknown>) => {
              const value = attrs[this.options.attributeName]
              if (!value) return {}
              return {
                id: String(value),
                'data-id': String(value),
              }
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
          // ドキュメント変更が無ければ何もしない（ただし最初の load 時は doc 全走査が必要）
          const docChanged = transactions.some(tr => tr.docChanged)
          const isInit = transactions.some(tr => tr.getMeta('uniqueId-init'))
          if (!docChanged && !isInit) return null

          const seen = new Set<string>()
          const updates: Array<{ pos: number; id: string }> = []

          newState.doc.descendants((node, pos) => {
            if (!types.has(node.type.name)) return true
            const current = node.attrs[attrName] as string | null | undefined
            if (!current || seen.has(current)) {
              updates.push({ pos, id: generateBlockId() })
            } else {
              seen.add(current)
            }
            return true
          })

          if (updates.length === 0) return null

          let tr = newState.tr
          for (const { pos, id } of updates) {
            const node = tr.doc.nodeAt(pos)
            if (!node) continue
            tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, [attrName]: id })
            seen.add(id)
          }
          tr.setMeta('addToHistory', false)
          // 親エディタの onUpdate 側で「ID 採番だけ」のトランザクションを検出してスキップさせる
          tr.setMeta('uniqueId/silent', true)
          return tr
        },

        // 初期ロード時に既存ドキュメントへ ID をバックフィルするフラグ。
        // `update` イベントで渡される transaction は dispatch に渡した root tr なので、
        // ここで `uniqueId/silent` も付けないと TiptapEditor 側のスキップ判定が効かない
        // （appendTransaction が返す tr ではなく root tr のメタがイベント参照される）。
        view: (editorView) => {
          editorView.dispatch(
            editorView.state.tr
              .setMeta('uniqueId-init', true)
              .setMeta('uniqueId/silent', true)
              .setMeta('addToHistory', false)
          )
          return {}
        },
      }),
    ]
  },
})
