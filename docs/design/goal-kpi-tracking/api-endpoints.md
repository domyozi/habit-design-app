# KPI/KGI ゴール逆算トラッキング API エンドポイント仕様

**作成日**: 2026-04-15
**関連設計**: [architecture.md](architecture.md)
**関連要件定義**: [requirements.md](../../spec/goal-kpi-tracking/requirements.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: 要件定義書・ヒアリング・既存 API 仕様を参考にした確実な定義
- 🟡 **黄信号**: 要件定義書・設計文書から妥当な推測による定義

---

## 共通仕様

### ベースURL 🔵

**信頼性**: 🔵 *既存 API 仕様より*

```
http://localhost:8000/api/v1   （開発）
https://{railway-domain}/api/v1 （本番）
```

### 認証 🔵

**信頼性**: 🔵 *既存アーキテクチャ設計より*

```http
Authorization: Bearer {supabase-jwt-token}
```

### エラーレスポンス 🔵

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "日本語エラーメッセージ"
  }
}
```

---

## 既存エンドポイントへの変更

### PATCH /goals/{goal_id}/kgi 🔵

**信頼性**: 🔵 *REQ-KGI-001〜REQ-KGI-007 より*

**説明**: 既存 Goal を KGI として設定（または KGI 属性を更新）する

**リクエスト**:
```json
{
  "target_value": 70,
  "unit": "kg",
  "target_date": "2026-10-15",
  "metric_type": "numeric",
  "current_value": 77.0
}
```

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `target_value` | number | ※ | numeric/percentage 型で推奨。binary 型では省略可 |
| `unit` | string | - | 単位（例: "kg"、"冊"、"%"）最大 20 文字 |
| `target_date` | string | ✅ | ISO 8601 日付（YYYY-MM-DD）。**必須**（REQ-KGI-002） |
| `metric_type` | string | ✅ | `"numeric"` \| `"percentage"` \| `"binary"` |
| `current_value` | number | - | 初期現在値 |

**レスポンス（成功）**:
```json
{
  "success": true,
  "data": {
    "id": "goal-uuid",
    "title": "体重 70kg 達成",
    "target_value": 70,
    "current_value": 77.0,
    "unit": "kg",
    "target_date": "2026-10-15",
    "metric_type": "numeric",
    "achievement_rate": 7.0,
    "days_remaining": 183,
    "is_expired": false,
    "is_kgi": true
  }
}
```

**エラーコード**:
- `TARGET_DATE_REQUIRED`: `target_date` が未指定
- `INVALID_METRIC_TYPE`: `metric_type` が不正な値
- `PERCENTAGE_OUT_OF_RANGE`: `percentage` 型で `target_value` が 0〜100 外

---

### PATCH /goals/{goal_id}/kgi/current-value 🔵

**信頼性**: 🔵 *REQ-KGI-005 より*

**説明**: KGI の現在値を更新する

**リクエスト**:
```json
{
  "current_value": 74.5
}
```

**レスポンス（成功）**:
```json
{
  "success": true,
  "data": {
    "id": "goal-uuid",
    "current_value": 74.5,
    "achievement_rate": 29.0,
    "days_remaining": 183,
    "is_expired": false
  }
}
```

---

### GET /goals?include_kgi=true 🔵

**信頼性**: 🔵 *REQ-DASH-001 より（既存 GET /goals の拡張）*

**説明**: アクティブな Goal 一覧を取得。`include_kgi=true` の場合は KGI 計算フィールドを付与。

**クエリパラメータ**:
- `include_kgi` (optional, bool): KGI 計算フィールドを含む

**レスポンス（成功）**:
```json
{
  "success": true,
  "data": [
    {
      "id": "goal-uuid",
      "title": "体重 70kg 達成",
      "is_kgi": true,
      "achievement_rate": 29.0,
      "days_remaining": 183,
      "is_expired": false,
      "metric_type": "numeric",
      "target_value": 70,
      "current_value": 74.5,
      "unit": "kg",
      "target_date": "2026-10-15"
    }
  ]
}
```

---

## 新規エンドポイント（KPI）

### POST /kpis 🔵

**信頼性**: 🔵 *REQ-KPI-001〜005 より*

**説明**: KPI を新規作成する

**リクエスト**:
```json
{
  "goal_id": "goal-uuid",
  "title": "週の運動日数",
  "description": "有酸素運動を含む運動の日数",
  "metric_type": "numeric",
  "target_value": 4,
  "unit": "回/週",
  "tracking_frequency": "weekly",
  "display_order": 0
}
```

**レスポンス（成功）**:
```json
{
  "success": true,
  "data": {
    "id": "kpi-uuid",
    "goal_id": "goal-uuid",
    "user_id": "user-uuid",
    "title": "週の運動日数",
    "metric_type": "numeric",
    "target_value": 4,
    "unit": "回/週",
    "tracking_frequency": "weekly",
    "is_active": true,
    "created_at": "2026-04-15T10:00:00Z"
  }
}
```

**エラーコード**:
- `GOAL_NOT_FOUND`: 指定 Goal が存在しない
- `GOAL_NOT_KGI`: 指定 Goal が KGI でない（target_date なし）
- `INVALID_METRIC_TYPE`: metric_type が不正

---

### GET /kpis?goal_id={goal_id} 🔵

**信頼性**: 🔵 *REQ-KPI-005 より*

**説明**: 指定 KGI の KPI 一覧を取得する

**クエリパラメータ**:
- `goal_id` (必須): 対象 KGI の ID

**レスポンス（成功）**:
```json
{
  "success": true,
  "data": [
    {
      "id": "kpi-uuid",
      "goal_id": "goal-uuid",
      "title": "週の運動日数",
      "metric_type": "numeric",
      "target_value": 4,
      "unit": "回/週",
      "tracking_frequency": "weekly",
      "habit_ids": ["habit-uuid-1", "habit-uuid-2"]
    }
  ]
}
```

---

### GET /kpis/today 🔵

**信頼性**: 🔵 *REQ-DASH-002 より*

**説明**: 今日の日付のKPI一覧（記録状況付き）を取得する

**レスポンス（成功）**:
```json
{
  "success": true,
  "data": [
    {
      "id": "kpi-uuid",
      "title": "体重",
      "metric_type": "numeric",
      "target_value": 70,
      "unit": "kg",
      "tracking_frequency": "daily",
      "today_completed": false,
      "today_value": null,
      "connected_habits": [
        { "habit_id": "habit-uuid", "habit_title": "朝のランニング" }
      ]
    }
  ]
}
```

---

### PUT /kpis/{kpi_id}/logs 🔵

**信頼性**: 🔵 *REQ-LOG-001・REQ-LOG-002・EDGE-KPI-007 より*

**説明**: KPI ログを記録（upsert）する。同日に複数回記録した場合は最新値で上書き。

**リクエスト**:
```json
{
  "log_date": "2026-04-15",
  "value": 74.5,
  "input_method": "manual",
  "note": "朝食後"
}
```

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `log_date` | string | ✅ | YYYY-MM-DD 形式 |
| `value` | number | ✅ | 記録値（binary: 1.0=達成, 0.0=未達成） |
| `input_method` | string | - | `"manual"` \| `"voice"` \| `"auto"` |
| `note` | string | - | メモ（最大 500 文字） |

**バリデーション**:
- `percentage` 型: `value` は 0〜100 の範囲
- `binary` 型: `value` は `0.0` または `1.0` のみ

**レスポンス（成功）**:
```json
{
  "success": true,
  "data": {
    "id": "log-uuid",
    "kpi_id": "kpi-uuid",
    "log_date": "2026-04-15",
    "value": 74.5,
    "input_method": "manual",
    "created_at": "2026-04-15T08:30:00Z"
  }
}
```

**エラーコード**:
- `PERCENTAGE_OUT_OF_RANGE`: percentage 型で 0〜100 外
- `BINARY_INVALID_VALUE`: binary 型で 0.0/1.0 以外

---

### GET /kpis/{kpi_id}/logs 🔵

**信頼性**: 🔵 *REQ-LOG-005 より*

**説明**: KPI のログ履歴をグラフ表示用に集計して取得する

**クエリパラメータ**:
- `granularity` (必須): `"daily"` \| `"weekly"` \| `"monthly"`
- `range` (optional): `"30d"` \| `"12w"` \| `"6m"` \| `"1y"`（デフォルト: granularity に応じて自動）

**レスポンス（成功）**:
```json
{
  "success": true,
  "data": {
    "kpi_id": "kpi-uuid",
    "granularity": "daily",
    "data_points": [
      { "date": "2026-04-15", "value": 74.5 },
      { "date": "2026-04-14", "value": 74.8 },
      { "date": "2026-04-13", "value": null }
    ],
    "summary": {
      "avg": 74.65,
      "max": 74.8,
      "min": 74.5,
      "latest_value": 74.5,
      "target_value": 70
    }
  }
}
```

---

### POST /kpis/{kpi_id}/habits 🔵

**信頼性**: 🔵 *REQ-KPI-006・REQ-KPI-007 より*

**説明**: KPI に習慣を紐付ける（全上書き方式）

**リクエスト**:
```json
{
  "habit_ids": ["habit-uuid-1", "habit-uuid-2"]
}
```

**レスポンス（成功）**:
```json
{
  "success": true,
  "data": {
    "kpi_id": "kpi-uuid",
    "habit_ids": ["habit-uuid-1", "habit-uuid-2"]
  }
}
```

---

### DELETE /kpis/{kpi_id} 🟡

**信頼性**: 🟡 *KPI 管理の通常 CRUD から推測*

**説明**: KPI を削除する（`kpi_logs`・`kpi_habits` はカスケード削除）

**レスポンス（成功）**:
```json
{
  "success": true
}
```

---

## 既存エンドポイントへの影響

### GET /habits（レスポンスへの KPI ラベル追加） 🔵

**信頼性**: 🔵 *REQ-DASH-002 より*

**変更内容**: レスポンスに `kpi_labels` フィールドを追加

```json
{
  "success": true,
  "data": [
    {
      "id": "habit-uuid",
      "title": "朝のランニング",
      "kpi_labels": [
        { "kpi_id": "kpi-uuid", "label": "→ 週の運動日数 +1" }
      ]
    }
  ]
}
```

---

### POST /voice-input（kpi_update 分類への対応追加） 🔵

**信頼性**: 🔵 *REQ-LOG-003・既存 JournalEntryType.kpi_update より*

**変更内容**: `type: "kpi_update"` の場合のレスポンスを拡張

```json
{
  "success": true,
  "data": {
    "type": "kpi_update",
    "value": 75.2,
    "unit_hint": "kg",
    "candidates": [
      { "kpi_id": "kpi-uuid", "title": "体重", "unit": "kg" }
    ]
  }
}
```

---

### POST /ai-coach/weekly-review（KGI 進捗コメント追加） 🔵

**信頼性**: 🔵 *REQ-REVIEW-001〜003 より*

**変更内容**: SSE レスポンスに `kgi_insights` セクションを追加

```
event: chunk
data: {"content": "今週の運動習慣は..."}

event: chunk
data: {"content": "体重目標への進捗は..."}

event: done
data: {
  "actions": [{"type": "add_habit", "reason": "..."}],
  "achievement_rate": 72,
  "kgi_insights": "KGI全体として..."
}
```

---

## 信頼性レベルサマリー

- 🔵 青信号: 12件 (86%)
- 🟡 黄信号: 2件 (14%)
- 🔴 赤信号: 0件 (0%)

**品質評価**: 高品質
