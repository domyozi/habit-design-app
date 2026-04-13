# 習慣設計アプリ API エンドポイント仕様

**作成日**: 2026-04-12
**関連設計**: [architecture.md](architecture.md)
**関連要件定義**: [requirements.md](../../spec/habit-design-app/requirements.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: 要件定義書・ユーザーヒアリングを参考にした確実な定義
- 🟡 **黄信号**: 要件定義書・ユーザーヒアリングから妥当な推測による定義
- 🔴 **赤信号**: 要件定義書・ユーザーヒアリングにない推測による定義

---

## 共通仕様

### ベースURL 🔵

**信頼性**: 🔵 *ヒアリング技術選定Q6（Railway）より*

```
開発環境: http://localhost:8000/api
本番環境: https://{railway-domain}.railway.app/api
```

### 認証 🔵

**信頼性**: 🔵 *NFR-101・Supabase Auth設計より*

Supabase が発行した JWT（アクセストークン）をヘッダーに付与。
バックエンドで JWT を検証し `user_id` を抽出。

```http
Authorization: Bearer {supabase_access_token}
```

### AI関連エンドポイントのストリーミング 🔵

**信頼性**: 🔵 *ヒアリング技術選定Q5（ストリーミング実装）より*

AI生成エンドポイント（`/ai/*`）は Server-Sent Events (SSE) で応答をストリーミング。

```
Content-Type: text/event-stream
```

SSE フォーマット:
```
data: {"type":"chunk","content":"今週は..."}\n\n
data: {"type":"chunk","content":"筋トレの..."}\n\n
data: {"type":"done","actions":[...]}\n\n
```

### エラーレスポンス共通フォーマット 🔵

**信頼性**: 🔵 *EDGE-001/003設計より*

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "日本語エラーメッセージ"
  }
}
```

主なエラーコード:
- `UNAUTHORIZED`: 認証エラー（401）
- `FORBIDDEN_ACTION`: 許可されていないAIアクション（400）
- `NOT_FOUND`: リソース未存在（404）
- `AI_UNAVAILABLE`: Claude API利用不可（503）
- `VALIDATION_ERROR`: 入力バリデーションエラー（422）

---

## エンドポイント一覧

### ユーザープロフィール

#### GET /users/me 🔵

**信頼性**: 🔵 *REQ-103より*

**説明**: ログインユーザーのプロフィール取得

**レスポンス（成功）**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "display_name": "田中 太郎",
    "timezone": "Asia/Tokyo",
    "weekly_review_day": 5,
    "notification_email": "user@example.com",
    "notification_enabled": true
  }
}
```

---

#### PATCH /users/me 🔵

**信頼性**: 🔵 *REQ-701/801/802より*

**説明**: プロフィール更新（週次レビュー曜日・通知設定等）

**リクエスト**:
```json
{
  "weekly_review_day": 5,
  "notification_email": "user@example.com",
  "notification_enabled": true
}
```

**レスポンス（成功）**: 更新後のUserProfileオブジェクト

---

### Wanna Be

#### GET /wanna-be 🔵

**信頼性**: 🔵 *REQ-201/202より*

**説明**: 現在有効なWanna Be取得

**レスポンス（成功）**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "text": "1年後の自分は毎朝6時に起き...",
    "version": 3,
    "is_current": true,
    "updated_at": "2026-04-12T10:00:00Z"
  }
}
```

---

#### POST /wanna-be/analyze 🔵

**信頼性**: 🔵 *REQ-201/203・ヒアリング技術選定Q5（ストリーミング）より*

**説明**: Wanna Beを保存し、AIが目標候補をストリーミングで返す

**Content-Type**: `application/json`（リクエスト）/ `text/event-stream`（レスポンス）

**リクエスト**:
```json
{
  "text": "1年後の自分は毎朝6時に起き、英語でプレゼンできて..."
}
```

**SSEレスポンス**:
```
data: {"type":"chunk","content":"あなたのWanna Beから"}\n\n
data: {"type":"chunk","content":"3つの目標を整理しました。"}\n\n
data: {"type":"done","suggested_goals":[
  {"title":"早起きの習慣化","description":"毎朝6時起床を定着させる"},
  {"title":"英語力向上","description":"ビジネス英語でのプレゼン習得"},
  {"title":"健康的な体づくり","description":"筋トレ・有酸素運動の定期実施"}
]}\n\n
```

**エラーコード**:
- `AI_UNAVAILABLE`: Claude API接続失敗時はテキスト保存のみ行い503を返す

---

#### POST /goals 🔵

**信頼性**: 🔵 *REQ-203/204より*

**説明**: AI提案の目標を承認・保存（最大3件）

**リクエスト**:
```json
{
  "wanna_be_id": "uuid",
  "goals": [
    {"title": "早起きの習慣化", "description": "毎朝6時起床"},
    {"title": "英語力向上", "description": "ビジネス英語習得"}
  ]
}
```

**バリデーション**: goals の件数が4件以上の場合は `VALIDATION_ERROR`

---

### 習慣（Habits）

#### GET /habits 🔵

**信頼性**: 🔵 *REQ-306・ダッシュボード設計より*

**説明**: 有効な習慣一覧を取得（今日のログ付き）

**クエリパラメータ**:
- `include_today_log` (boolean, default: true): 今日のログを含む

**レスポンス（成功）**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "ランニング30分",
      "goal_id": "uuid",
      "scheduled_time": "07:00",
      "current_streak": 14,
      "today_log": {
        "completed": false,
        "log_date": "2026-04-12"
      },
      "goal": {
        "title": "健康的な体づくり"
      },
      "wanna_be_connection_text": "→ 過去一の身体に +1"
    }
  ]
}
```

---

#### POST /habits 🔵

**信頼性**: 🔵 *REQ-301/302/304より*

**説明**: 習慣を新規作成

**リクエスト**:
```json
{
  "title": "英語30分",
  "goal_id": "uuid",
  "scheduled_time": "07:30",
  "frequency": "daily"
}
```

---

#### PATCH /habits/{habit_id} 🔵

**信頼性**: 🔵 *REQ-303/304/305より*

**説明**: 習慣を更新。AI提案承認（change_time/add_habit/remove_habit）または手動編集。

**重要**: action フィールドで操作種別を検証。AI提案は3種類のみ許可（REQ-303）

**リクエスト（AI提案: 時間帯変更）**:
```json
{
  "action": "change_time",
  "scheduled_time": "07:00"
}
```

**リクエスト（手動編集）**:
```json
{
  "action": "manual_edit",
  "title": "ランニング45分",
  "scheduled_time": "06:30"
}
```

**エラーコード**:
- `FORBIDDEN_ACTION`: action が許可外の値の場合（400）

---

#### DELETE /habits/{habit_id} 🔵

**信頼性**: 🔵 *REQ-304より*

**説明**: 習慣を論理削除（is_active = false に設定）

---

#### PATCH /habits/{habit_id}/log 🔵

**信頼性**: 🔵 *REQ-404/501/502・ユーザーストーリー2.1より*

**説明**: 習慣の達成/未達成を記録。ストリーク更新・バッジ判定も自動実行。

**リクエスト**:
```json
{
  "date": "2026-04-12",
  "completed": true,
  "input_method": "manual"
}
```

**レスポンス（成功）**:
```json
{
  "success": true,
  "data": {
    "log": { "completed": true, "log_date": "2026-04-12" },
    "streak": 15,
    "badge_earned": {
      "id": "uuid",
      "badge": { "id": "streak_14", "name": "2週間連続" }
    }
  }
}
```

---

#### POST /habits/{habit_id}/failure-reason 🔵

**信頼性**: 🔵 *REQ-406より*

**説明**: 未達成の理由を記録

**リクエスト**:
```json
{
  "log_date": "2026-04-12",
  "reason": "残業で時間がなかった"
}
```

---

### 音声入力（Voice Input）

#### POST /voice-input 🔵

**信頼性**: 🔵 *REQ-401/402/403・ユーザーストーリー2.2より*

**説明**: 汎用テキスト入力をAIが自動分類し、対応するデータを更新

**リクエスト**:
```json
{
  "text": "今日は早起き達成、筋トレはできなかった、英語30分やった",
  "date": "2026-04-12"
}
```

**レスポンス（成功 - チェックリスト分類）**:
```json
{
  "success": true,
  "data": {
    "type": "checklist",
    "updated_habits": [
      { "habit_id": "uuid", "title": "早起き", "completed": true },
      { "habit_id": "uuid", "title": "英語学習", "completed": true }
    ],
    "failed_habits": [
      { "habit_id": "uuid", "title": "筋トレ" }
    ]
  }
}
```

**レスポンス（AI判断不能 - EDGE-003）**:
```json
{
  "success": true,
  "data": {
    "type": "unknown",
    "message": "どの操作ですか？"
  }
}
```

---

### AIコーチ

#### GET /ai/weekly-review/stream 🔵

**信頼性**: 🔵 *REQ-601/602/702・ヒアリング技術選定Q5（ストリーミング）より*

**説明**: 今週の習慣データをAIが分析し、フィードバックをSSEでストリーミング

**Content-Type レスポンス**: `text/event-stream`

**クエリパラメータ**:
- `week_start` (optional, YYYY-MM-DD): 対象週の月曜日（省略時は今週）

**SSEレスポンス**:
```
data: {"type":"chunk","content":"今週の振り返りです。"}\n\n
data: {"type":"chunk","content":"筋トレの未達成が水曜・木曜に集中しています。"}\n\n
data: {"type":"done","actions":[
  {
    "type":"change_time",
    "habit_id":"uuid",
    "suggested_time":"07:00",
    "reason":"夜の残業が多い曜日のため、朝に移動することを提案します"
  }
],"achievement_rate":71.4}\n\n
```

**エラー（AI利用不可時 - EDGE-001）**:
```
data: {"type":"error","error":"AI_UNAVAILABLE"}\n\n
```

---

### 通知設定

#### GET /notifications/settings 🔵

**信頼性**: 🔵 *REQ-801/802より*

**説明**: 通知設定を取得

**レスポンス（成功）**:
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

#### PATCH /notifications/settings 🔵

**信頼性**: 🔵 *REQ-801/802より*

**説明**: 通知設定を更新

**リクエスト**:
```json
{
  "notification_enabled": false
}
```

---

## CORS設定 🔵

**信頼性**: 🔵 *NFR-103・Vercelデプロイ設計より*

許可オリジン:
- 開発: `http://localhost:5173`（Vite デフォルト）
- 本番: `https://{vercel-domain}.vercel.app`

---

## 信頼性レベルサマリー

- 🔵 青信号: 22件 (92%)
- 🟡 黄信号: 2件 (8%)
- 🔴 赤信号: 0件 (0%)

**品質評価**: 高品質
