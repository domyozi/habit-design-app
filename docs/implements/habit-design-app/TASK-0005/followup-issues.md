# TASK-0005 Follow-up Issues

発見日: 2026-04-14
検出者: 実装レビュー

---

## BUG-0004: APIパスが設計の `/api/users/me` ではなく `/api/v1/me` になっている

- **関連タスク**: TASK-0005
- **重要度**: High
- **状態**: Open
- **修正タスク**: [TASK-0026](../../../tasks/habit-design-app/TASK-0026.md)

### 背景

TASK-0005 の実装詳細では API ルーターを `/api` 配下に統合し、設計書 `api-endpoints.md` では `GET /users/me` を公開する前提になっている。後続の TASK-0006 も同じ前提で API を追加する設計になっている。

### 再現手順

1. FastAPI アプリのルーティング一覧を確認する
2. 認証エンドポイントのパスを確認する

### 期待結果

`/api/users/me` が公開されている

### 実結果

`/api/v1/me` のみが登録されている

### 根拠ファイル

- `backend/app/api/routes/__init__.py`（`APIRouter(prefix="/api/v1")`）
- `backend/app/api/routes/me.py`（`@router.get("/me")`）
- `docs/tasks/habit-design-app/TASK-0005.md`
- `docs/design/habit-design-app/api-endpoints.md`
- `docs/tasks/habit-design-app/TASK-0006.md`

### 修正方針案

共通ルーターのプレフィックスと各サブルーターのパスを見直し、`/api/users/me` を正規の入口に統一する。

---

## BUG-0005: Supabaseクライアントが `app.state.supabase` に保持されていない

- **関連タスク**: TASK-0005
- **重要度**: Medium
- **状態**: Open
- **修正タスク**: [TASK-0026](../../../tasks/habit-design-app/TASK-0026.md)

### 背景

TASK-0005 の注意事項では、lifespan で初期化した Supabase クライアントを `app.state.supabase` に格納し、各エンドポイントから `Request` 経由で参照する設計になっている。

### 再現手順

1. `backend/app/main.py` の `app` オブジェクトを読み込む
2. `hasattr(app.state, "supabase")` を確認する

### 期待結果

`app.state.supabase` が存在し、初期化済みクライアントまたは未設定時の値が格納されている

### 実結果

`app.state.supabase` が設定されておらず、グローバルシングルトンのみで管理されている

### 根拠ファイル

- `backend/app/main.py`
- `backend/app/core/supabase.py`
- `docs/tasks/habit-design-app/TASK-0005.md`

### 修正方針案

lifespan で `init_supabase()` の返却値を `app.state.supabase` に格納し、ルート実装は `Request.app.state.supabase` を第一参照先にする。

---

## BUG-0006: 422バリデーションエラーが完全な日本語メッセージになっていない

- **関連タスク**: TASK-0005
- **重要度**: Medium
- **状態**: Open
- **修正タスク**: [TASK-0026](../../../tasks/habit-design-app/TASK-0026.md)

### 背景

TASK-0005 の完了条件には「422バリデーションエラー時に日本語メッセージが返ること」がある。

### 再現手順

1. 必須項目を欠いた JSON をバリデーション対象エンドポイントに送る
2. 422 レスポンスの `error.message` を確認する

### 期待結果

日本語だけで意味が通るメッセージが返る

### 実結果

`入力値エラー: body → name: Field required` のように Pydantic 既定の英語文言が残る

### 根拠ファイル

- `backend/app/core/exceptions.py`
- `docs/tasks/habit-design-app/TASK-0005.md`

### 修正方針案

Pydantic エラー種別ごとの日本語変換を実装し、代表的な 422 ケースをテストで固定する。
