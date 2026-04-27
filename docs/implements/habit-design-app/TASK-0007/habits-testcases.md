# 習慣CRUD API テストケース定義

## 使用技術

- **プログラミング言語**: Python 3.12
- **テストフレームワーク**: pytest + FastAPI TestClient
- **モック**: unittest.mock
- **テストファイル**: `backend/tests/test_habits.py`
- 🔵 参照: `backend/CLAUDE.md`, `backend/tests/conftest.py`

## 正常系テストケース

### TC-001: 習慣一覧取得（正常）
- **何をテストするか**: 認証済みユーザーが習慣一覧を取得できること
- **入力値**: `GET /api/habits` + 有効なBearerトークン
- **DBモック**: `is_active=true` の習慣リスト3件を返す
- **期待される結果**: 200, `success=true`, `data` に3件の習慣リスト
- 🔵 参照: REQ-301, api-endpoints.md

### TC-002: 今日のログ付き習慣一覧
- **何をテストするか**: `include_today_log=true` の場合、today_log が付与されること
- **入力値**: `GET /api/habits?include_today_log=true` + 有効なBearerトークン
- **DBモック**: 習慣2件 + habit_logsに1件（completed=true）
- **期待される結果**: 200, 1件は `today_log.completed=true`、1件は `today_log=null`
- 🔵 参照: REQ-301, api-endpoints.md

### TC-003: 習慣作成（正常）
- **何をテストするか**: 有効なリクエストで習慣が作成されること
- **入力値**: `POST /api/habits` + `{"title": "ランニング30分", "frequency": "daily", "scheduled_time": "07:00"}`
- **DBモック**: INSERTが成功し作成された習慣を返す
- **期待される結果**: 201, `success=true`, 作成された習慣データ
- 🔵 参照: REQ-302

### TC-004: AI許可アクション change_time で習慣更新
- **何をテストするか**: `action=change_time` で時刻変更が許可されること
- **入力値**: `PATCH /api/habits/{id}` + `{"action": "change_time", "scheduled_time": "07:30"}`
- **DBモック**: 自ユーザーの習慣を返し、UPDATE成功
- **期待される結果**: 200, 更新された習慣データ
- 🔵 参照: REQ-303

### TC-005: manual_edit で習慣更新
- **何をテストするか**: `action=manual_edit` で手動編集ができること
- **入力値**: `PATCH /api/habits/{id}` + `{"action": "manual_edit", "title": "ランニング45分"}`
- **DBモック**: 自ユーザーの習慣を返し、UPDATE成功
- **期待される結果**: 200, 更新された習慣データ
- 🔵 参照: REQ-304

### TC-006: 習慣論理削除（正常）
- **何をテストするか**: DELETE で `is_active=false` になること（204 返却）
- **入力値**: `DELETE /api/habits/{id}` + 有効なBearerトークン
- **DBモック**: 自ユーザーの習慣を返し、UPDATE成功
- **期待される結果**: 204
- 🔵 参照: REQ-306

### TC-007: add_habit アクションで習慣更新
- **何をテストするか**: AI提案 `add_habit` が許可されること
- **入力値**: `PATCH /api/habits/{id}` + `{"action": "add_habit", "title": "英語30分"}`
- **DBモック**: UPDATE成功
- **期待される結果**: 200
- 🔵 参照: REQ-303

### TC-008: remove_habit アクションで習慣更新
- **何をテストするか**: AI提案 `remove_habit` が許可されること
- **入力値**: `PATCH /api/habits/{id}` + `{"action": "remove_habit"}`
- **DBモック**: UPDATE成功
- **期待される結果**: 200
- 🔵 参照: REQ-303

## 異常系テストケース

### TC-009: 許可外AIアクションで FORBIDDEN_ACTION
- **何をテストするか**: `action=delete_all` など不明なアクションは拒否されること
- **入力値**: `PATCH /api/habits/{id}` + `{"action": "delete_all"}`
- **期待される結果**: 400, `error.code="FORBIDDEN_ACTION"`
- 🔵 参照: REQ-303

### TC-010: 他ユーザーの習慣への更新で 403
- **何をテストするか**: 別ユーザーの習慣を更新しようとした場合 403 が返ること
- **入力値**: `PATCH /api/habits/{other_user_habit_id}` + `{"action": "manual_edit"}`
- **DBモック**: 習慣の user_id が別ユーザー
- **期待される結果**: 403
- 🔵 参照: NFR-101, NFR-102

### TC-011: 他ユーザーの習慣の削除で 403
- **何をテストするか**: 別ユーザーの習慣を削除しようとした場合 403 が返ること
- **入力値**: `DELETE /api/habits/{other_user_habit_id}`
- **DBモック**: 習慣の user_id が別ユーザー
- **期待される結果**: 403
- 🔵 参照: NFR-101

### TC-012: 存在しない習慣の更新で 404
- **何をテストするか**: 存在しない habit_id への PATCH は 404 が返ること
- **入力値**: `PATCH /api/habits/nonexistent-id` + `{"action": "manual_edit"}`
- **DBモック**: SELECT が [] を返す
- **期待される結果**: 404
- 🔵 参照: api-endpoints.md

### TC-013: 未認証リクエストで 403
- **何をテストするか**: Bearer ヘッダーなしは拒否されること
- **入力値**: `GET /api/habits` (ヘッダーなし)
- **期待される結果**: 403
- 🔵 参照: NFR-101

### TC-014: 習慣作成 - タイトル必須チェック
- **何をテストするか**: `title` 未指定で 422 が返ること
- **入力値**: `POST /api/habits` + `{"frequency": "daily"}`
- **期待される結果**: 422, VALIDATION_ERROR
- 🔵 参照: Pydantic バリデーション

## 境界値テストケース

### TC-015: 習慣一覧0件（空リスト）
- **何をテストするか**: 習慣が0件の場合 200 + 空リストが返ること
- **DBモック**: `[]` を返す
- **期待される結果**: 200, `data=[]`
- 🔵 参照: REQ-301

### TC-016: 存在しない習慣の削除で 404
- **入力値**: `DELETE /api/habits/nonexistent-id`
- **DBモック**: SELECT が [] を返す
- **期待される結果**: 404
- 🟡 推測: 404 が自然な振る舞い

### TC-017: タイトル最大長（200文字）で習慣作成
- **何をテストするか**: 200文字のタイトルで作成できること
- **入力値**: `POST /api/habits` + `{"title": "あ" * 200, "frequency": "daily"}`
- **期待される結果**: 201
- 🔵 参照: DBスキーマ VARCHAR(200)
