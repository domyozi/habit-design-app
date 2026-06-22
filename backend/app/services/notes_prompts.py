"""
Notes inline AI のプロンプトテンプレート。

POST /api/ai/notes-prompt-stream から呼ばれる。ノート本文の編集補助に
特化していて、coach と違って action JSON は emit しない (本文 markdown のみ)。

設計方針:
- 出力は常に markdown 本文のみ。前置き / 確認文 / コードフェンスでの括り禁止
- 元の文体・トーンを尊重し、求められた変換だけを行う
- "本文を勝手に追加削除しない" を system 側で明示
"""
from __future__ import annotations

# 既定 system 指示。すべての mode 共通の振る舞いを規定する。
_BASE_SYSTEM = """あなたはユーザーの個人ノート編集を補助するアシスタントです。

ルール:
- 出力は常にノート本文として貼り付け可能な markdown のみ
- 前置き ("はい" / "わかりました" / "以下が..." 等) は禁止
- コードフェンス (``` ) で全体を括らない
- 元の文体・トーン・敬体/常体を尊重する
- 求められた変換だけを行い、勝手な追加削除はしない
- 短い相槌や曖昧な依頼には「具体例を教えてください」と本文として返す
""".strip()


# mode 別の追加指示。freeform は base のみ、その他は追加指示で意図を絞る。
_MODE_HINTS: dict[str, str] = {
    "freeform": "",
    "summarize": "依頼内容に従って要約してください。元の構造 (見出し / 箇条書き) を尊重し、固有名詞は削らないこと。",
    "rewrite": "依頼内容に従って言い換えてください。意味は保持し、語彙とリズムだけ変える。",
    "translate": "依頼内容に従って翻訳してください。固有名詞・数値はそのまま残すこと。",
    "continue": "選択範囲または直前の本文の続きを、同じトーンで自然に書き継いでください。1-3 段落 (200-500 字程度) で止める。",
    "tone": "依頼内容に従ってトーンを変更してください。内容は保持し、語感だけ変える。",
}


# ノート全文の context が大きすぎると token 課金が暴れるので軽い上限を入れる
# (Haiku 入力 ~200k token あるが、運用コストの予防線として)。
NOTE_CONTEXT_MAX_CHARS = 12_000  # ≈ 4-6k token (日本語の場合)
SELECTION_MAX_CHARS = 4_000
PROMPT_MAX_CHARS = 1_000


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    # 中央を抜くより末尾を残す方が「最近書いた部分」を保持できる
    head = limit // 3
    tail = limit - head
    return text[:head] + "\n\n…(中略)…\n\n" + text[-tail:]


def build_notes_prompt(
    *,
    note_markdown: str,
    selection_text: str,
    prompt: str,
    mode: str = "freeform",
) -> tuple[str, str]:
    """
    Returns:
        (system_prompt, user_prompt)
    """
    hint = _MODE_HINTS.get(mode, "")
    system = _BASE_SYSTEM if not hint else f"{_BASE_SYSTEM}\n\n# モード別の追加指示\n{hint}"

    ctx = _truncate(note_markdown or "", NOTE_CONTEXT_MAX_CHARS)
    sel = _truncate(selection_text or "", SELECTION_MAX_CHARS)
    p = (prompt or "").strip()[:PROMPT_MAX_CHARS]

    user = (
        "## ノート全文 (参考 context)\n"
        f"{ctx if ctx.strip() else '(空)'}\n\n"
        "## 選択範囲 (変換対象)\n"
        f"{sel if sel.strip() else '(なし — 新規生成として扱う)'}\n\n"
        "## 依頼\n"
        f"{p if p else '(空 — 上記モード指示に従う)'}"
    )

    return system, user


__all__ = [
    "build_notes_prompt",
    "NOTE_CONTEXT_MAX_CHARS",
    "SELECTION_MAX_CHARS",
    "PROMPT_MAX_CHARS",
]
