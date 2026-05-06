import { wrappingInputRule } from '@tiptap/core'
import { OrderedList, orderedListInputRegex } from '@tiptap/extension-list'

// 全角数字 (U+FF10〜U+FF19) + 半角ピリオド or 全角ピリオド (U+FF0E `．`) + 空白 で orderedList。
// `１．` `１.` `12．` などを拾う。半角の `1. ` は既定 regex を別途残しているのでそちらが処理。
const JA_ORDERED_REGEX = /^([０-９]+)[．.][\s\u3000]$/

const toHalfWidthDigits = (value: string): string =>
  value.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))

export const OrderedListJa = OrderedList.extend({
  addInputRules() {
    return [
      wrappingInputRule({
        find: orderedListInputRegex,
        type: this.type,
        getAttributes: (match) => ({ start: Number.parseInt(match[1], 10) }),
        joinPredicate: (match, node) =>
          node.childCount + node.attrs.start === Number.parseInt(match[1], 10),
      }),
      wrappingInputRule({
        find: JA_ORDERED_REGEX,
        type: this.type,
        getAttributes: (match) => ({ start: Number.parseInt(toHalfWidthDigits(match[1]), 10) }),
        joinPredicate: (match, node) =>
          node.childCount + node.attrs.start ===
          Number.parseInt(toHalfWidthDigits(match[1]), 10),
      }),
    ]
  },
})
