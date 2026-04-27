# 習慣CRUD API 要件定義

## 1. 機能の概要

- **何をする機能か**: 習慣の作成・取得・更新・論理削除（CRUD）を提供するREST API
- **どのような問題を解決するか**: ユーザーの習慣をDB管理し、AI提案の承認/拒否フィルタを提供する
- **想定されるユーザー**: 認証済みアプリユーザー
- **システム内での位置づけ**: ダッシュボード・習慣チェックリストの基盤API
- **参照したEARS要件**: REQ-301, REQ-302, REQ-303, REQ-304, REQ-305, REQ-306
- **参照した設計文書**: `docs/design/habit-design-app/api-endpoints.md`, `architecture.md` 🔵

## 2. 入力・出力の仕様

### GET /habits

- **入力**: クエリパラメータ `include_today_log: bool = True`
- **出力**: `APIResponse[List[HabitWithLog]]`
  - `HabitWithLog`: Habit に `today_log: Optional[HabitLog]` を追加
- 🔵 参照: api-endpoints.md, REQ-301

### POST /habits

- **入力** (`CreateHabitRequest`):
  - `title: str` (必須, 1〜200文字) 🔵
  - `goal_id: Optional[str]`
  - `frequency: HabitFrequency = "daily"` ("daily"|"weekdays"|"weekends"|"custom")
  - `scheduled_time: Optional[str]` (HH:MM形式)
  - `display_order: Optional[int]`
- **出力**: `APIResponse[Habit]`（ステータス201）
- 🔵 参照: api-endpoints.md, REQ-302

### PATCH /habits/{habit_id}

- **入力** (`UpdateHabitRequest`):
  - `action: Literal["change_time", "add_habit", "remove_habit", "manual_edit"]` (必須)
  - `title: Optional[str]`
  - `scheduled_time: Optional[str]`
  - `goal_id: Optional[str]`
- **出力**: `APIResponse[Habit]`（ステータス200）
- **エラー**:
  - 許可外actionの場合: 400 FORBIDDEN_ACTION
  - 他ユーザーの習慣: 403 FORBIDDEN
  - 存在しない習慣: 404 NOT_FOUND
- 🔵 参照: api-endpoints.md, REQ-303/304/305

### DELETE /habits/{habit_id}

- **入力**: パスパラメータ `habit_id: str`
- **出力**: 204 No Content
- **エラー**:
  - 他ユーザーの習慣: 403 FORBIDDEN
  - 存在しない習慣: 404 NOT_FOUND
- 🔵 参照: api-endpoints.md, REQ-306

## 3. 制約条件

- **認証**: 全エンドポイントで Bearer トークン必須（NFR-101）🔵
- **RLS**: Supabase RLS により自ユーザーのみアクセス可能。アプリ層でも明示チェック 🔵
- **論理削除**: `is_active=false` に更新（物理削除しない）。habit_logs の履歴は保持 🔵 REQ-304
- **AIアクション制限**: change_time/add_habit/remove_habit/manual_edit 以外は拒否 🔵 REQ-303
- **title**: 1〜200文字 🔵 DBスキーマ VARCHAR(200)
- 参照: `database-schema.sql`, `api-endpoints.md`

## 4. 想定される使用例

### 基本使用例

1. ダッシュボード表示: `GET /habits?include_today_log=true` で今日のチェックリスト取得
2. 習慣追加: `POST /habits` でユーザーが新習慣を作成
3. AI提案承認: `PATCH /habits/{id}` に `action=change_time` で時刻変更
4. 手動編集: `PATCH /habits/{id}` に `action=manual_edit` でタイトル変更
5. 習慣削除: `DELETE /habits/{id}` で論理削除

### エラーケース

- action が "delete_all" など不明: 400 FORBIDDEN_ACTION 🔵 REQ-303
- 他ユーザーの習慣ID指定: 403 FORBIDDEN 🔵 NFR-101
- 存在しないhabit_id: 404 NOT_FOUND 🔵

## 5. EARS要件との対応関係

- **参照した機能要件**: REQ-301（習慣一覧）, REQ-302（習慣作成）, REQ-303（AI提案）, REQ-304（削除）, REQ-305（時刻変更）, REQ-306（論理削除）
- **参照した非機能要件**: NFR-101（認証）, NFR-102（RLS）
- **参照した設計文書**:
  - **アーキテクチャ**: `docs/design/habit-design-app/architecture.md`
  - **データベース**: `docs/design/habit-design-app/database-schema.sql`（habits, habit_logs テーブル）
  - **API仕様**: `docs/design/habit-design-app/api-endpoints.md`（GET/POST/PATCH/DELETE /habits）
