# フロントエンド開発ガイド（Claude 向け）

> **全体調整ルールはルートの `/CLAUDE.md` を先に読むこと。**
> Codex 向けルールは `/CODEX.md`。AIDesigner ルールは `/.claude/agents/aidesigner-frontend.md`。

React 18 + Vite + TypeScript によるフロントエンドプロジェクト。

---

## Claude のフロントエンドにおける役割

`frontend/src/` の実装は **Codex が担当**。
Claude がフロントエンドを触ってよいのは以下の場合のみ：

| 許可されている操作 | 場所 |
|---|---|
| E2E 統合テストの作成・修正 | `frontend/tests/e2e/` |
| このファイル（CLAUDE.md）の更新 | `frontend/CLAUDE.md` |
| ビルドを壊す緊急バグの修正 | `frontend/src/lib/`, `frontend/src/hooks/` |
| 共通基盤の小さなバグ修正（API クライアント・認証フック等） | `frontend/src/lib/`, `frontend/src/hooks/` |

**Claude が `frontend/src/` を修正したら必ず `/CODEX.md` の「Claude からの共有指示」に記録する。**

---

## 開発コマンド

```bash
# 開発サーバー起動（http://localhost:5173）
npm run dev

# 本番ビルド
npm run build

# TypeScript 型チェック
npx tsc --noEmit

# ESLint
npm run lint

# ユニットテスト
npm test

# E2E テスト（TASK-0025 以降）
npm run test:e2e

# Visual review baseline 更新
npm run test:visual:update

# Visual review 実行
npm run test:visual
```

---

## 環境変数

`.env.example` をコピーして `.env` を作成する（`.env` 本体は触らない）：

| 変数名 | 説明 |
|--------|------|
| `VITE_SUPABASE_URL` | Supabase プロジェクト URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase Anon Key |
| `VITE_API_BASE_URL` | FastAPI バックエンド URL（デフォルト: http://localhost:8000） |

---

## 技術スタック

- **フレームワーク**: React 18 + Vite
- **言語**: TypeScript（strict mode）
- **スタイリング**: Tailwind CSS v3（ダークテーマ: `bg-[#020617]`）
- **ルーティング**: React Router v6
- **サーバー状態**: TanStack Query v5
- **クライアント状態**: Zustand v4
- **フォーム**: React Hook Form v7
- **認証・DB**: Supabase JS v2
- **HTTP**: axios

---

## API 実装前の確認必須ルール

フロントエンドに関わる変更を行う前に必ず読む：

- `docs/design/habit-design-app/api-endpoints.md` — エンドポイント一覧
- `docs/design/habit-design-app/interfaces.ts` — 共有型定義
- `docs/design/habit-design-app/dataflow.md` — データフロー
- `docs/spec/habit-design-app/requirements.md` — 要件定義

**実レスポンスが仕様と違う場合：**
- フロントで勝手に吸収しない
- バックエンドを修正する（Claude が担当）
- `interfaces.ts` を変更する場合は `backend/app/models/schemas.py` と整合確認する

---

## デザイン変更の進め方

**AIDesigner は任意ツール。クレジットがなくてもデザイン変更は完結できる。**

### AIDesigner なし（標準フロー）

1. **Claude が `docs/dev/screen-specs/{画面名}.md` に変更仕様を記述する**
   - 変更する色・間隔・コンポーネント構成を具体的に書く
   - 「ダークテーマ統一」「ガラスモーフィズム」などの方針を明示
2. **Codex がスペックを元に実装する**
3. **Codex が `npm run test:visual` でビフォーアフターを比較する**
4. **人手レビューで採否を判断する**

### AIDesigner あり（クレジットに余裕がある場合のみ）

1. Claude が AIDesigner にデザイン方針を依頼
2. AIDesigner が HTML artifact を生成（`.aidesigner/runs/` に保存）
3. Claude が採否を判断し screen spec に記録する
4. Codex がスペックを元に実装する（raw HTML をそのまま貼らない）

### どちらの場合も変えてはいけないこと

- AIDesigner の raw HTML を `frontend/src/` にそのままコピーしない
- 実装は必ず既存コンポーネント・Tailwind トークンと統合する
- デザイン変更と機能変更を同じサイクルに混ぜない

---

## デザインシステム規約

### ダークテーマ基本トークン

```
背景:      bg-[#020617]
カード:    bg-white/[0.04] border border-white/[0.08]
テキスト:  text-slate-100 / text-slate-300 / text-slate-400 / text-slate-500
アクセント: text-emerald-400 / bg-emerald-500
エラー:    text-red-400 / border-red-400/30
警告:      text-amber-400 / bg-amber-400/10
```

### ガラスモーフィズム（共通パターン）

```tsx
style={{
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.08)',
}}
```

### レイアウト構造

- 認証済み画面は `AuthenticatedLayout` でラップする（`bg-[#020617]` + `BottomNav`）
- 各ページは `pb-24` でフッターナビ分の余白を確保する
- コンテンツ幅: `max-w-2xl mx-auto px-5`

---

## E2E テスト（Claude が担当）

```bash
# E2E テスト実行
npm run test:e2e

# テストレポート確認
npm run test:e2e:report
```

**E2E テストファイル構成:**

```
frontend/tests/e2e/
├── helpers/
│   ├── auth.ts      # 認証モック（Supabase localStorage 注入）
│   └── mocks.ts     # API モック（page.route() ベース）
├── flow2-habit-check.spec.ts
├── flow4-weekly-review.spec.ts
└── flow5-error-handling.spec.ts
```

**E2E テストの認証:** Supabase ストレージキー `sb-kamzmrqxhbwxmtqinvdy-auth-token` に fake session を注入する。

---

## テスト命名規約

```ts
describe('ComponentName', () => {
  it('should ...', () => { ... })
})
```

---

## パスエイリアス

```typescript
import { UserProfile } from '@/types/interfaces'   // src/types/
import { apiGet } from '@/lib/api'                  // src/lib/
import { useAuthStore } from '@/store/authStore'    // src/store/
```
