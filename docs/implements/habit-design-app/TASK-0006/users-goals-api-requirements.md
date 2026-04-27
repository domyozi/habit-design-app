# TASK-0006 要件定義: ユーザープロフィール・Wanna Be・長期目標・通知設定API

## 1. 機能の概要

🔵 信頼性: REQ-103/201/202/203/204/701/801/802・api-endpoints.md より

### 対象機能

ログインユーザーが自身のプロフィール・Wanna Be・長期目標・通知設定を管理するためのAPIエンドポイント群。

- **ユーザープロフィールAPI**: プロフィール取得・部分更新
- **Wanna Be API**: 現在有効なWanna Beの取得
- **長期目標API**: AIが提案した目標の承認・保存（最大3件）
- **通知設定API**: 通知設定の取得・更新

### ユーザー
- JWTで認証済みのログインユーザー（As a: 登録ユーザー）

### システム内での位置づけ
- TASK-0005 の共通基盤（ErrorResponse, get_current_user, get_supabase）を利用
- TASK-0010（Wanna Be AI分析・SSEストリーミング）の前提となるデータ操作レイヤー

---

## 2. 入力・出力の仕様

🔵 信頼性: api-endpoints.md・interfaces.ts より

### GET /api/v1/users/me

**入力**: Authorization: Bearer <JWT>

**出力（200 成功）**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "display_name": "田中 太郎",
    "timezone": "Asia/Tokyo",
    "weekly_review_day": 5,
    "notification_email": "user@example.com",
    "notification_enabled": true,
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T00:00:00Z"
  }
}
```

**出力（404 未存在）**:
```json
{"success": false, "error": {"code": "NOT_FOUND", "message": "ユーザープロフィール が見つかりません"}}
```

---

### PATCH /api/v1/users/me

**入力**:
```json
{
  "display_name": "田中 太郎",       // optional
  "timezone": "Asia/Tokyo",           // optional
  "weekly_review_day": 5,             // optional, 1〜7
  "notification_email": "...",        // optional
  "notification_enabled": true        // optional
}
```

**出力（200 成功）**: 更新後の UserProfile（GET と同形式）

---

### GET /api/v1/wanna-be

**入力**: Authorization: Bearer <JWT>

**出力（200 存在あり）**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "text": "1年後の自分は...",
    "version": 1,
    "is_current": true,
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T00:00:00Z"
  }
}
```

**出力（204 未登録）**: レスポンスボディなし

---

### POST /api/v1/goals

**入力**:
```json
{
  "wanna_be_id": "uuid",    // optional
  "goals": [
    {"title": "早起きの習慣化", "description": "毎朝6時起床"},
    {"title": "英語力向上", "description": "ビジネス英語習得"}
  ]
}
```

**バリデーション**: `goals` 件数が 4件以上 → 400 VALIDATION_ERROR

**出力（201 成功）**:
```json
{
  "success": true,
  "data": [
    {"id": "uuid", "title": "早起きの習慣化", "is_active": true, ...},
    {"id": "uuid", "title": "英語力向上", "is_active": true, ...}
  ]
}
```

**出力（400 件数超過）**:
```json
{"success": false, "error": {"code": "VALIDATION_ERROR", "message": "目標は最大3件まで設定できます"}}
```

---

### GET /api/v1/notifications/settings

**入力**: Authorization: Bearer <JWT>

**出力（200 成功）**:
```json
{
  "success": true,
  "data": {
    "notification_enabled": true,
    "notification_email": "user@example.com",
    "weekly_review_day": 5
  }
}
```

---

### PATCH /api/v1/notifications/settings

**入力**:
```json
{
  "notification_enabled": false,      // optional
  "notification_email": "...",        // optional
  "weekly_review_day": 1              // optional, 1〜7
}
```

**出力（200 成功）**: 更新後の NotificationSettings（GET と同形式）

---

## 3. 制約条件

🔵 信頼性: REQ-204/701/801/802・api-endpoints.md より

- **REQ-204**: `POST /goals` の goals 件数は1〜3件。4件以上は `VALIDATION_ERROR`
- **REQ-701**: `weekly_review_day` は 1〜7（スキーマの CHECK 制約）
- **NFR-101**: 全エンドポイントでJWT認証必須（`Depends(get_current_user)`）
- **RLS**: service_role で DB 操作するが、`user_id` フィルタを明示的に追加
- **部分更新**: PATCH は未指定フィールドを変更しない
- **POST /goals の処理順序**:
  1. 件数バリデーション（4件以上→即400）
  2. 既存 `is_active=true` 目標を全て `is_active=false` に更新
  3. 新目標を INSERT（display_order: 0,1,2...）
- **goals 件数バリデーションのタイミング**: 今回送信する件数が 4件以上の場合にエラー（既存件数との合算ではなく、送信件数のみで判定）
  - 参照: TASK-0006.md「新規保存後の合計が3件を超える場合」→ 今回送信する件数が1〜3件であれば既存目標は非活性化して上書き

---

## 4. 想定される使用例

🔵 信頼性: api-endpoints.md・dataflow.md より

### 基本フロー
1. ユーザーがログイン → JWT 取得
2. `GET /users/me` でプロフィール確認
3. `PATCH /users/me` でタイムゾーン・週次レビュー曜日を設定
4. `GET /wanna-be` で現在の Wanna Be を確認（未登録なら 204）
5. （AI分析後）`POST /goals` で目標を保存

### エッジケース
- Wanna Be 未登録: 204 No Content を返す
- goals 4件送信: 400 VALIDATION_ERROR（"目標は最大3件まで設定できます"）
- プロフィール未存在: GET /users/me で 404
- 全フィールド省略の PATCH: 何も更新せず現在値を返す

---

## 5. 実装ファイル構成

🔵 信頼性: architecture.md・TASK-0006.md より

```
backend/app/
  api/
    routes/
      users.py           # GET/PATCH /users/me
      wanna_be.py        # GET /wanna-be
      goals.py           # POST /goals
      notifications.py   # GET/PATCH /notifications/settings
      __init__.py        # api_router に各ルーターを追加
  models/
    schemas.py           # NotificationSettings スキーマを追加
tests/
  test_users_wanna_be_goals.py   # 今回のテストファイル
```

### NotificationSettings スキーマ（schemas.py に追加）

```python
class NotificationSettings(BaseModel):
    notification_enabled: bool
    notification_email: Optional[str] = None
    weekly_review_day: int = Field(default=5, ge=1, le=7)
```

### POST /goals リクエストスキーマ（schemas.py に追加）

```python
class GoalItem(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None

class SaveGoalsRequest(BaseModel):
    wanna_be_id: Optional[str] = None
    goals: list[GoalItem] = Field(..., min_length=1, max_length=3)
```

---

## 6. API要件との対応関係

| 要件ID | 内容 | 実装箇所 |
|--------|------|---------|
| REQ-103 | ユーザーデータのクラウド保存 | GET/PATCH /users/me |
| REQ-201 | Wanna Be 登録 | GET /wanna-be（登録はTASK-0010） |
| REQ-202 | Wanna Be 編集 | GET /wanna-be（編集はTASK-0010） |
| REQ-203 | AI目標提案の保存 | POST /goals |
| REQ-204 | 目標3件以内の制約 | POST /goals バリデーション |
| REQ-701 | 週次レビュー曜日設定 | PATCH /users/me, PATCH /notifications/settings |
| REQ-801 | リマインダー通知設定 | GET/PATCH /notifications/settings |
| REQ-802 | 通知オフで停止 | PATCH /notifications/settings |
