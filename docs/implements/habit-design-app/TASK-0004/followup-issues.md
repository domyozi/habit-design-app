# TASK-0004 Follow-up Issues

発見日: 2026-04-13
検出者: コードレビュー

---

## BUG-0001: ログアウト導線が UI に存在しない

- **関連タスク**: TASK-0004
- **重要度**: Medium
- **状態**: Open
- **修正タスク**: TASK-0013（認証画面・オンボーディング遷移実装）または TASK-0014（ダッシュボード画面実装）

### 背景

TASK-0004 の完了条件に「Google アカウントでログイン・ログアウトができること」がある。

### 再現手順

1. Google アカウントでアプリにログインする
2. 画面上からログアウト操作を探す

### 期待結果

ユーザーが UI 上からログアウトできる

### 実結果

`signOut()` の実装は `frontend/src/store/authStore.ts:56` にあるが、UI から呼び出せる要素がない

### 根拠ファイル

- `frontend/src/store/authStore.ts`（signOut 実装あり）
- `frontend/src/App.tsx`（ログアウトボタンなし）

### 修正方針案

ダッシュボード仮画面または共通ヘッダーにログアウトボタンを追加する。
TASK-0013/0014 実装時に合わせて対応する。

---

## BUG-0002: Authorization ヘッダー欠落時に 401 ではなく 403 が返る

- **関連タスク**: TASK-0004
- **重要度**: Medium
- **状態**: Open
- **修正タスク**: TASK-0004 再実施 または TASK-0005（FastAPI共通基盤実装）

### 背景

TASK-0004 の完了条件に「未認証状態で API アクセス時に 401 が返ること」がある。

### 再現手順

1. `Authorization` ヘッダーなしで保護エンドポイントにリクエストを送る
2. レスポンスのステータスコードを確認する

### 期待結果

HTTP 401 Unauthorized

### 実結果

HTTP 403 Forbidden（`HTTPBearer(auto_error=True)` が FastAPI 標準の 403 を返す）

### 根拠ファイル

- `backend/app/core/security.py:19`（`HTTPBearer(auto_error=True)`）

### 修正方針案

`HTTPBearer(auto_error=False)` に変更し、`get_current_user` 内で credentials が None の場合に手動で 401 を raise する。

```python
http_bearer = HTTPBearer(auto_error=False)

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer),
) -> str:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = verify_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user_id
```

**注意**: テストケース TC-005 の期待値も `403 → 401` に合わせて変更が必要。

---

## BUG-0003: onAuthStateChange の購読が解除されない（低優先度）

- **関連タスク**: TASK-0004
- **重要度**: Low
- **状態**: Open
- **修正タスク**: TASK-0012（フロントエンド共通基盤）

### 背景

React StrictMode では開発時に `useEffect` が2回実行されるため、`onAuthStateChange` が重複購読される。

### 再現手順

1. 開発環境（`npm run dev`）でアプリを起動する
2. 認証イベントが二重に発火することをコンソールで確認する

### 期待結果

`useEffect` のクリーンアップ関数で購読を解除する

### 実結果

`frontend/src/App.tsx:86` の `initialize()` 呼び出しでは購読解除ロジックがない

### 根拠ファイル

- `frontend/src/App.tsx:86`
- `frontend/src/store/authStore.ts:76`
- `frontend/src/main.tsx:7`（StrictMode 有効）

### 修正方針案

`initialize()` が購読解除関数を返し、`useEffect` のクリーンアップで呼ぶ。

```typescript
initialize: () => {
  supabase.auth.getSession().then(...)
  const { data: { subscription } } = supabase.auth.onAuthStateChange(...)
  return () => subscription.unsubscribe()  // クリーンアップ用に返す
}
```

```tsx
useEffect(() => {
  const cleanup = initialize()
  return cleanup  // StrictMode 対応
}, [initialize])
```
