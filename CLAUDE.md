# エージェント協調ガイド（ルートルール）

このリポジトリは複数のエージェントが協調して開発する。
各エージェントは担当領域を明確に分離し、衝突・二重作業・認識ズレを防ぐ。

---

## エージェント役割定義

### 開発チーム（このプロジェクト専用）

| エージェント | 担当領域 | 主なツール |
|---|---|---|
| **Claude (TSUMIKI)** | `backend/`・`docs/`・タスク管理・全体調整 | Python/FastAPI・pytest・git |
| **Codex** | `frontend/` の実装 | TypeScript/React・Vite・Vitest |
| **AIDesigner** | UIデザイン生成（任意・クレジット依存） | AIDesigner MCP・HTML artifact |

### 汎用開発ワークフロー（新規プロダクト開発時）

| エージェント | 役割 |
|---|---|
| **Planner** | 1〜4行のプロンプト → Sprint Spec 生成 |
| **Generator** | Sprint Spec を1スプリントずつ実装 |
| **Evaluator** | Playwright MCP でテスト・合否判定 |

---

## ファイル所有権マップ

```
backend/          → Claude が書く。Codex・AIDesigner は読み取り専用
frontend/src/     → Codex が書く。Claude は原則書かない（例外あり）
frontend/tests/e2e/ → Claude が書いてよい（E2E統合テスト）
docs/             → Claude が書く。両者読む
docs/design/habit-design-app/api-endpoints.md   → Claude が書く（API変更時）
docs/design/habit-design-app/interfaces.ts      → Claude が書く（型変更時）
CLAUDE.md / backend/CLAUDE.md / frontend/CLAUDE.md → Claude が管理
CODEX.md          → Claude が書く（Codex へのルール通達）
.claude/agents/   → Claude が管理
```

---

## 作業フロー

### バックエンド変更時（Claude 主導）

1. `backend/` を実装・テスト
2. API の変更があれば `docs/design/habit-design-app/api-endpoints.md` と `interfaces.ts` を更新
3. `CODEX.md` の「Claude からの共有指示」セクションに変更の要点を追記
4. Codex がフロントエンドを実装する

### フロントエンド設計変更時

AIDesigner のクレジットが残っている場合と残っていない場合で手順が変わる。

**AIDesigner あり（クレジットに余裕がある場合）:**
1. Claude が AIDesigner にデザイン方針を依頼
2. AIDesigner が HTML artifact を生成
3. Claude が採否を判断し `docs/dev/screen-specs/` にスペックを記録
4. Codex がスペックを元に `frontend/src/` に実装
5. Codex が `npm run build` + `npm run test` で品質確認

**AIDesigner なし（クレジット不足・使わない場合）:**
1. Claude が `docs/dev/screen-specs/` に変更仕様をテキストで記述する（色・レイアウト・コンポーネント構成を具体的に書く）
2. Codex がスペックを元に直接実装する
3. Codex が `npm run build` + `npm run lint` + `npm run test:visual` で確認
4. ビジュアルレビューで採否を判断する

**AIDesigner は必須ではない。** デザインの意思決定は Claude が行い、実装は Codex が行う体制で完結できる。

### バグ修正（優先度別）

| 種別 | 担当 |
|------|------|
| バックエンドのバグ | Claude が直す |
| フロントエンドのバグ（Codex セッション中） | Codex に依頼 |
| フロントエンドのバグ（Claude が発見・Codex 不在） | Claude が最小限の修正を行う（後述の例外ルール参照） |
| API 不整合由来のフロントエンドバグ | Claude が backend を修正し、Codex にフロントの修正を依頼 |

---

## Claude がフロントエンドを触ってよい例外ルール

原則として `frontend/src/` は Codex の管轄だが、以下は Claude が直接修正してよい：

1. **E2Eテスト** (`frontend/tests/e2e/`) — 統合テストは Claude が書く
2. **CLAUDE.md 類** — エージェント設定ファイルは Claude が管理
3. **緊急バグ修正** — ビルドが壊れている、または他のエージェントがブロックされている場合
4. **共通 hook・lib のバグ修正** — API クライアント・認証フック等の小さな不具合

**Claude がフロントを修正したら必ず：**
- コミットメッセージに `[claude]` プレフィックスを付ける
- `CODEX.md` の「Claude からの共有指示」に変更内容を要約する

---

## 共有ファイルの扱い

### `docs/design/habit-design-app/interfaces.ts`
- バックエンドスキーマ (`backend/app/models/schemas.py`) を「正」とする
- Claude が変更する → Codex が `frontend/src/types/interfaces.ts` に反映する
- Codex が変更が必要と判断したら、まず Claude に確認を取る

### `docs/design/habit-design-app/api-endpoints.md`
- Claude のみが書く
- フロントエンドが 405/422/404 を受けたときは、まずこのファイルと照合する

---

## エージェント間のコンフリクト防止ルール

1. **同じファイルに同時に手を出さない** — 作業開始前に `git status` で確認する
2. **バックエンド変更は先にドキュメントを更新** — Codex が古い仕様で実装しないよう、先に `api-endpoints.md` を更新してから実装する
3. **フロントエンドで API 不整合を発見したら Codex 側でサイレントに吸収しない** — Claude に差し戻す
4. **Claude が `frontend/src/` を変更したら Codex に通知する** — `CODEX.md` に記録する
5. **AIDesigner の成果物はそのまま `frontend/src/` にコピーしない** — Codex が既存コンポーネントと統合する

---

## コミット規約

| エージェント | プレフィックス例 |
|---|---|
| Claude | `feat(backend):`, `fix(backend):`, `docs:`, `[claude] fix(frontend):` |
| Codex | `feat(frontend):`, `fix(frontend):`, `test(frontend):` |
| AIDesigner 起点 | `design:` （Codex が実装時に付与） |

---

---

## Planner / Generator / Evaluator の連携フロー

```
ユーザー（1〜4行）
    │
    ▼
┌─────────────┐
│   Planner   │  → docs/sprint-spec/{name}.md を生成
│             │    「何を作るか」だけ定義。実装詳細は書かない
└─────────────┘
    │  Sprint Spec
    ▼
┌─────────────┐
│  Generator  │  → 1スプリントずつ実装
│             │    完了後、自己評価レポートを作成
└─────────────┘
    │  引き渡しパケット
    ▼
┌─────────────┐
│  Evaluator  │  → Playwright MCP で実際にアプリを操作
│             │    閾値ベースで合否判定
└─────────────┘
    │
    ├── ✅ 合格 → Generator は次スプリントへ
    │
    └── ❌ 不合格 → 具体的なフィードバックを Generator に返す
                     Generator が修正 → Evaluator が再テスト
```

### エージェントファイル

| エージェント | ファイル |
|---|---|
| Planner | `.claude/agents/planner.md` |
| Generator | `.claude/agents/generator.md` |
| Evaluator | `.claude/agents/evaluator.md` |

### 成果物の保存先

| 成果物 | 保存先 |
|---|---|
| Sprint Spec | `docs/sprint-spec/{product-name}.md` |
| 自己評価レポート | Generator が各スプリント完了時に生成 |
| Evaluator レポート | Evaluator が各スプリントテスト後に生成 |

---

## 参照文書

- バックエンドルール: `backend/CLAUDE.md`
- フロントエンドルール: `frontend/CLAUDE.md`（Claude 向け）・`CODEX.md`（Codex 向け）
- タスク管理: `docs/tasks/habit-design-app/overview.md`
- API仕様: `docs/design/habit-design-app/api-endpoints.md`
- 型定義: `docs/design/habit-design-app/interfaces.ts`


---

## コンテキスト管理（ハーネス）

機能実装が1つ完了するたびに `/compact` を実行する。
圧縮前に必ず以下をdocs/tasks/habit-design-app/overview.mdに記録する：
- 完了した機能の概要
- 変更ファイルと内容の要約
- 残タスクと優先順位
- 現在の完成度スコア（0〜100）

コンテキストが長くなったと判断したら、確認なしに自律的に `/compact` を実行してよい。

---

## タスク複雑度の判定

タスクを受け取ったら最初に複雑度を判定し、対応を変える。

**Simple**（1ファイル・30分以内）
→ 確認不要。即座に実装して完了を報告する。

**Medium**（複数ファイル・1〜2時間）
→ 方針を1行で伝えてから実装。確認は1回まで。

**Complex**（アーキテクチャ変更・3時間超）
→ Planner→Generator→Evaluatorフローを使う。