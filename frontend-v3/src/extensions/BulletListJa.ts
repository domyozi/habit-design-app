import { wrappingInputRule } from '@tiptap/core'
import { BulletList, bulletListInputRegex } from '@tiptap/extension-list'

// 行頭の `・` (U+30FB 中黒) や各種ダッシュ + 半角/全角スペースで bulletList へ。
// 末尾は半角スペース or 全角スペース (U+3000)。Enter は ProseMirror の input rule では拾えない
// ため、IME 確定後に追加するスペースをトリガーにする運用。
const JA_BULLET_REGEX = /^\s*([・‐–—])[\s\u3000]$/

export const BulletListJa = BulletList.extend({
  addInputRules() {
    return [
      wrappingInputRule({ find: bulletListInputRegex, type: this.type }),
      wrappingInputRule({ find: JA_BULLET_REGEX, type: this.type }),
    ]
  },
})
