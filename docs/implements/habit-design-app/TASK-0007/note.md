# TASK-0007 タスクノート: 習慣CRUD API実装

## 1. 技術スタック

- **フレームワーク**: FastAPI 0.111 + Python 3.12
- **DB/認証**: supabase-py 2.x（モックして単体テスト）
- **バリデーション**: Pydantic v2
- **テストフレームワーク**: pytest + FastAPI TestClient
- **認証**: JWTトークン（Bearer）、`get_current_user` 依存関数
- 参照元: `backend/CLAUDE.md`, `docs/tech-stack.md`

## 2. 開発ルール

- モックは `unittest.mock.patch("app.api.routes.habits.get_supabase")` で注入
  - IMPORTANT: パッチ先はインポート元ではなく呼び出し元モジュール
- `APIResponse[T]` でレスポンスを統一
- エラーは `AppError` / `NotFoundError` / `ForbiddenError` を使用
- Pydantic v2: `model_dump(exclude_none=True)` でパーシャル更新
- テストでは `session` スコープの `client` フィクスチャを利用
- 参照元: `docs/rule/`, `backend/tests/conftest.py`

## 3. 関連実装

- 習慣スキーマ: `backend/app/models/schemas.py`
  - `Habit`, `HabitLog`, `CreateHabitRequest`, `UpdateHabitRequest`
  - `AIActionType = Literal["change_time", "add_habit", "remove_habit"]`
  - `HabitFrequency = Literal["daily", "weekdays", "weekends", "custom"]`
- 既存パターン: `backend/app/api/routes/goals.py`（CREATE+LIST）
- 既存パターン: `backend/app/api/routes/wanna_be.py`（204 No Content 返し方）
- 参照元: `backend/app/api/routes/goals.py`, `backend/app/api/routes/wanna_be.py`

## 4. 設計文書

- API仕様: `docs/design/habit-design-app/api-endpoints.md`
  - `GET /habits`: is_active=true の習慣一覧（今日のログ付き）
  - `POST /habits`: 習慣作成（201）
  - `PATCH /habits/{habit_id}`: action フィールドで操作種別を判定
  - `DELETE /habits/{habit_id}`: 論理削除（204）
- DBスキーマ: `docs/design/habit-design-app/database-schema.sql`
  - `habits` テーブル: id, user_id, goal_id, title, frequency, scheduled_time, is_active
  - `habit_logs` テーブル: id, habit_id, user_id, log_date, completed
- タスク仕様: `docs/tasks/habit-design-app/TASK-0007.md`

## 5. テスト関連情報

- テストファイルのパス: `backend/tests/test_habits.py`（新規作成）
- テスト実行コマンド: `cd backend && source .venv/bin/activate && pytest tests/test_habits.py -v`
- conftest.py の場所: `backend/tests/conftest.py`
  - `valid_token`, `expired_token`, `invalid_token` フィクスチャあり
  - `TEST_USER_ID = "00000000-0000-0000-0000-000000000001"`
  - `client` フィクスチャ（session スコープ）あり

### Supabaseモックパターン

```python
with patch("app.api.routes.habits.get_supabase") as mock_get_supabase:
    mock_sb = MagicMock()
    mock_get_supabase.return_value = mock_sb
    # SELECT 系
    mock_sb.table.return_value.select.return_value \
        .eq.return_value.execute.return_value.data = [...]
    # 連鎖クエリ
    mock_sb.table.return_value.select.return_value \
        .eq.return_value.eq.return_value.execute.return_value.data = [...]
```

## 6. 注意事項

- **FORBIDDEN_ACTIONチェック**: `action` フィールドが "change_time", "add_habit", "remove_habit", "manual_edit" 以外の場合は 400 FORBIDDEN_ACTION
  - Pydanticの `Literal` で事前に弾かれる（422）か、ルーターで弾く（400）かの設計判断が必要
  - TASK-0007.md では `FORBIDDEN_ACTION`（400）と明記 → ルーターで明示的にチェック
- **論理削除**: `is_active=false` に更新するだけ、物理削除しない
- **今日のログ**: `include_today_log=true` の場合は `habit_logs` テーブルから今日分を取得
- **wanna_be_connection_text**: goal.title から動的生成 `"→ {goal.title} +1"` またはDB保存値を返す
- **action=None の場合**: `manual_edit` として扱う
- **ForbiddenError**: 他ユーザーの習慣への操作は 403
- 参照元: `docs/tasks/habit-design-app/TASK-0007.md`
