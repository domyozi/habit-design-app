# TASK-0006 テストケース定義: ユーザープロフィール・Wanna Be・長期目標・通知設定API

## 開発言語・フレームワーク

- **プログラミング言語**: Python 3.12
- **テストフレームワーク**: pytest + unittest.mock
- **テストクライアント**: FastAPI TestClient
- **テストファイル**: `backend/tests/test_users_wanna_be_goals.py`

🔵 信頼性: TASK-0006 note.md・既存テストパターンより

---

## 1. 正常系テストケース

### TC-001: プロフィール取得（正常）
🔵 信頼性: REQ-103・api-endpoints.md GET /users/me より

- **何をテストするか**: 有効なJWTで GET /users/me を叩くとプロフィールが返ること
- **入力値**: valid_token, Supabase が userProfile を返すようにモック
- **期待される結果**: HTTP 200, `{"success": true, "data": {...UserProfile}}`
- **確認ポイント**: id, display_name, timezone, weekly_review_day が含まれる

---

### TC-002: プロフィール更新（正常）
🔵 信頼性: REQ-701・api-endpoints.md PATCH /users/me より

- **何をテストするか**: PATCH /users/me でプロフィールを部分更新できること
- **入力値**: `{"weekly_review_day": 1, "notification_enabled": false}`
- **期待される結果**: HTTP 200, 更新後のプロフィールが返る
- **確認ポイント**: レスポンスの weekly_review_day が 1 になっている

---

### TC-003: Wanna Be 取得（登録済み）
🔵 信頼性: REQ-201/202・api-endpoints.md GET /wanna-be より

- **何をテストするか**: is_current=true の Wanna Be が返ること
- **入力値**: valid_token, Supabase が wanna_be レコードを返すようにモック
- **期待される結果**: HTTP 200, `{"success": true, "data": {...WannaBe}}`
- **確認ポイント**: text, version, is_current が含まれる

---

### TC-004: Wanna Be 取得（未登録）
🔵 信頼性: api-endpoints.md GET /wanna-be（204の場合）より

- **何をテストするか**: Wanna Be 未登録時に 204 が返ること
- **入力値**: valid_token, Supabase が data=None を返すようにモック
- **期待される結果**: HTTP 204, ボディなし
- **確認ポイント**: status_code == 204

---

### TC-005: 目標保存（正常・2件）
🔵 信頼性: REQ-203・api-endpoints.md POST /goals より

- **何をテストするか**: 2件の目標を POST /goals で保存できること
- **入力値**: `{"goals": [{"title": "目標A"}, {"title": "目標B"}]}`
- **期待される結果**: HTTP 201, `{"success": true, "data": [Goal, Goal]}`
- **確認ポイント**: 2件のGoalオブジェクトが返る

---

### TC-006: 目標保存（正常・3件上限）
🔵 信頼性: REQ-204 より

- **何をテストするか**: 3件ちょうどで保存できること
- **入力値**: `{"goals": [{"title": "A"}, {"title": "B"}, {"title": "C"}]}`
- **期待される結果**: HTTP 201, 3件のGoalリストが返る

---

### TC-007: 通知設定取得（正常）
🔵 信頼性: REQ-801・api-endpoints.md GET /notifications/settings より

- **何をテストするか**: 通知設定が取得できること
- **入力値**: valid_token
- **期待される結果**: HTTP 200, `{"success": true, "data": {"notification_enabled": true, "notification_email": ..., "weekly_review_day": 5}}`
- **確認ポイント**: 3フィールドが全て含まれる

---

### TC-008: 通知設定更新（正常）
🔵 信頼性: REQ-802・api-endpoints.md PATCH /notifications/settings より

- **何をテストするか**: notification_enabled=false に更新できること
- **入力値**: `{"notification_enabled": false}`
- **期待される結果**: HTTP 200, 更新後の設定が返る
- **確認ポイント**: notification_enabled が false になっている

---

## 2. 異常系テストケース

### TC-009: 目標4件でVALIDATION_ERROR
🔵 信頼性: REQ-204 より

- **何をテストするか**: 4件以上の目標を送信するとエラーが返ること
- **入力値**: `{"goals": [{"title": "A"}, {"title": "B"}, {"title": "C"}, {"title": "D"}]}`
- **期待される結果**: HTTP 400, `{"success": false, "error": {"code": "VALIDATION_ERROR", "message": "目標は最大3件まで設定できます"}}`
- **確認ポイント**: error.code == "VALIDATION_ERROR"

---

### TC-010: 認証なしでプロフィール取得→403
🔵 信頼性: NFR-101 より

- **何をテストするか**: Authorization ヘッダーなしで GET /users/me を叩くと 403 が返ること
- **入力値**: なし（Authorizationヘッダーなし）
- **期待される結果**: HTTP 403
- **確認ポイント**: BUG-0002 により 403（HTTPBearer auto_error=True）

---

### TC-011: 無効なトークンで401
🔵 信頼性: NFR-101 より

- **何をテストするか**: 不正なJWTで GET /users/me を叩くと 401 が返ること
- **入力値**: invalid_token
- **期待される結果**: HTTP 401, ErrorResponse 形式

---

### TC-012: プロフィール未存在で404
🔵 信頼性: api-endpoints.md より

- **何をテストするか**: DBにプロフィールがない場合 404 が返ること
- **入力値**: valid_token, Supabase が data=None を返すようにモック
- **期待される結果**: HTTP 404, `{"error": {"code": "NOT_FOUND", ...}}`

---

### TC-013: 目標0件でバリデーションエラー
🔵 信頼性: SaveGoalsRequest min_length=1 より

- **何をテストするか**: goals を空配列で送信するとバリデーションエラーになること
- **入力値**: `{"goals": []}`
- **期待される結果**: HTTP 422

---

## 3. 境界値テストケース

### TC-014: weekly_review_day の境界値（1=最小）
🔵 信頼性: DBスキーマ CHECK (weekly_review_day BETWEEN 1 AND 7) より

- **何をテストするか**: weekly_review_day=1（月曜）で更新できること
- **入力値**: `{"weekly_review_day": 1}`
- **期待される結果**: HTTP 200

---

### TC-015: weekly_review_day の境界値（7=最大）
🔵 信頼性: DBスキーマ CHECK (weekly_review_day BETWEEN 1 AND 7) より

- **何をテストするか**: weekly_review_day=7（日曜）で更新できること
- **入力値**: `{"weekly_review_day": 7}`
- **期待される結果**: HTTP 200

---

### TC-016: weekly_review_day の境界値外（0=無効）
🔵 信頼性: UpdateUserProfileRequest ge=1 より

- **何をテストするか**: weekly_review_day=0（無効値）で 422 が返ること
- **入力値**: `{"weekly_review_day": 0}`
- **期待される結果**: HTTP 422

---

### TC-017: 目標タイトルが空文字でバリデーションエラー
🔵 信頼性: GoalItem min_length=1 より

- **何をテストするか**: タイトルが空の目標は保存できないこと
- **入力値**: `{"goals": [{"title": ""}]}`
- **期待される結果**: HTTP 422

---

## テストケース分類サマリー

| 分類 | 件数 |
|------|------|
| 正常系 | 8件（TC-001〜TC-008） |
| 異常系 | 5件（TC-009〜TC-013） |
| 境界値 | 4件（TC-014〜TC-017） |
| **合計** | **17件** |
