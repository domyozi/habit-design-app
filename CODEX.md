# Codex Workspace Instructions

このファイルは、このリポジトリで Codex が優先的に従う恒久ガイドとして扱う。
セッションを clear しても参照できるよう、プロジェクト固有のルールはここに集約する。

## 1. ファイル所有権の分離

- `backend/` は Claude / TSUMIKI 管轄。Codex は原則編集しない
- `frontend/` は Codex 管轄
- `docs/` は両者とも読む。書くのは原則 Claude
- 競合を避けるため、同じファイルに跨る編集は避ける
- 共有ファイルの変更が必要なら、変更前に確認を取る

### 所有権マップ

- `backend/` → Claude (TSUMIKI) が書く
- `frontend/` → Codex が書く
- `docs/` → どちらも読む、書くのは原則 Claude

## 2. API コントラクト確認を先に行う

- フロントエンド実装前に必ず `docs/design/habit-design-app/api-endpoints.md` を読む
- あわせて以下も確認する
  - `docs/design/habit-design-app/interfaces.ts`
  - `docs/design/habit-design-app/dataflow.md`
  - `docs/spec/habit-design-app/requirements.md`
  - 必要に応じて `docs/tasks/habit-design-app/TASK-0012.md` 以降のタスク
- バックエンドの実レスポンスが仕様書と違う場合は、Codex 側で勝手に合わせず Claude に確認する
- トラブルの主因は API レスポンス形式の認識ズレなので、ここを最優先で守る

## 3. 共有ファイルの扱い

- `docs/design/habit-design-app/interfaces.ts` はフロントエンド/バックエンド共通の型定義
- Codex が `interfaces.ts` を変更する場合は、`backend/app/models/schemas.py` と整合しているか確認する
- 現状の正は `backend/app/models/schemas.py`
- `api-endpoints.md` と `interfaces.ts` の変更は、原則として事前確認の上で行う

## 4. 環境変数ルール

- Codex が触るのは `.env.example` のみ
- `.env` は Git 管理外のため編集対象にしない
- 新しい環境変数を追加する場合は `.env.example` にキーだけ追記し、実値は別途連携する

## 5. 作業開始前・コミット前の確認

- 作業開始前に `git pull` で最新を取得してから進める
- バックエンドの変更は触らない
- 共有ファイル（`interfaces.ts`, `api-endpoints.md`）を変更する前に確認する
- 問題が API 不整合由来なら、フロントで吸収せず Claude 側に差し戻す

## 6. テスト命名ルール

- バックエンドは pytest 形式

```python
class TestXxx:
    def test_xxx_yyy(self): ...
```

- フロントエンドは vitest / testing-library 形式を推奨

```ts
describe('ComponentName', () => {
  it('should ...', () => { ... })
})
```

- 新規フロントエンドテストはこの命名に揃える

## 7. フロントエンドデザイン方針

- このプロジェクトでは UI/UX 改善を継続的に回す
- 初回の重点対象は `frontend/src/pages/Login.tsx`
- 目的は「AI 時代にふさわしい洗練感」と「使いたくなる映え」の両立
- 安全側の平均的 UI ではなく、意図が見えるビジュアルを優先する
- 既存画面の改善では、機能変更とデザイン変更を混在させない
- まずデザイントークンを整え、その上で画面を磨く
- タイポグラフィ、余白、配色、背景演出、モーションを一つの視覚言語として揃える
- ありがちな紫一色の AI 風 UI に寄せず、知性・静かな高級感・未来感を優先する
- desktop と mobile の両方でファーストビューに主 CTA が見えることを重視する

## 8. Visual Review Workflow

- Playwright を visual review の標準手段として使う
- baseline 更新: `cd frontend && npm run test:visual:update`
- 通常確認: `cd frontend && npm run test:visual`
- 比較対象は full page と primary CTA を基本とする
- 採否は自動差分だけで決めず、必ず人手レビューも行う

## 9. Motion Guidance

- 背景演出や hover 演出は導入してよい
- ただし、可読性・操作性・パフォーマンスを壊す演出は禁止
- まずは CSS ベースの `animation` / `transition` / `transform` / `filter` を優先する
- 状態に応じた制御やインタラクション連動が必要な場合のみ TypeScript を使う
- `prefers-reduced-motion` を常に尊重する

## 10. Artifacts / Tsumiki Alignment

- Artifacts（積み木）へ渡す指示は、以下の形で構造化する
  - 狙い
  - 変更要素
  - 禁止事項
  - 受け入れ条件
- 1サイクルで扱うテーマは 1 つに絞る
- 改善結果は screen spec または関連ドキュメントへ反映する

## 11. 推奨参照文書

- `docs/design/habit-design-app/api-endpoints.md`
- `docs/design/habit-design-app/interfaces.ts`
- `docs/design/habit-design-app/dataflow.md`
- `docs/spec/habit-design-app/requirements.md`
- `docs/tasks/habit-design-app/TASK-0012.md` 以降のタスクファイル

## 12. 運用フロー

1. Claude が `backend/` を実装し、テストを通す
2. Codex が `api-endpoints.md` を確認して `frontend/` を実装する
3. Codex がビルド・Lint・テストの検証サイクルを回す
4. API 不整合などの問題があれば Claude 側に差し戻す
5. 双方 OK になったらコミットする

## 13. Claude からの共有指示

以下は Claude から共有された運用ルールの要旨であり、このリポジトリでは恒久ルールとして扱う。
Claude が `frontend/src/` を直接修正した場合もここに記録される。

- 最重要: ファイル所有権を分離する
- 最重要: API レスポンス形式の認識ズレを防ぐ
- `.env` ではなく `.env.example` を扱う
- 共通型はバックエンドスキーマを正として整合確認する

### 2026-04-15 Claude による frontend 修正（Phase 4 バグ修正）

以下は Claude が直接修正した箇所。Codex は把握しておくこと：

| ファイル | 修正内容 |
|---|---|
| `src/hooks/useSSEStream.ts` | SSE URL が `window.location.origin` ベースになっていたバグを修正。`VITE_API_BASE_URL` を使うよう変更 |
| `src/components/ai/WannaBeAnalysis.tsx` | `selectedIndices` 初期化バグを修正（`useEffect` 追加）。ダークテーマ統一 |
| `src/components/dashboard/VoiceInputModal.tsx` | `onResend` プロップ追加・再送ボタン表示 |
| `src/pages/Dashboard.tsx` | `onResend` ハンドラー追加 |
| `src/components/habits/HabitList.tsx` | チェックボタンに `data-testid="habit-check-{id}"` を追加（E2E テスト対応） |
| `src/components/layout/BottomNav.tsx` | 新規作成（Dashboard から抽出） |
| `src/components/layout/AuthenticatedLayout.tsx` | 新規作成（ダーク背景 + BottomNav ラッパー） |
| `src/pages/Settings.tsx` | ダークテーマに統一 |

### E2E テスト（Claude が担当・Codex は触らない）

`frontend/tests/e2e/` は Claude が管理するE2Eテスト。
`npm run test:e2e` で実行できる。
