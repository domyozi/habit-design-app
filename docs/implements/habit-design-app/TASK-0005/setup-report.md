# TASK-0005 設定作業実行

## 作業概要

- **タスクID**: TASK-0005
- **作業内容**: FastAPI共通基盤実装（Pydanticスキーマ・エラーハンドラー・Supabaseクライアント・ルーター統合）
- **実行日時**: 2026-04-13
- **タスクタイプ**: DIRECT

## 設計文書参照

- **参照文書**: docs/design/habit-design-app/api-endpoints.md, interfaces.ts, architecture.md
- **関連要件**: REQ-303（AIアクション3種類制限）, NFR-101（CORS設定）, NFR-102（公開エンドポイント）

## 実行した作業

### 1. Pydantic スキーマ定義

**作成ファイル**: `backend/app/models/schemas.py`

- `APIResponse[T]` ジェネリックレスポンス型
- `ErrorDetail`, `ErrorResponse` エラーレスポンス型
- `AIActionType` Literal（change_time, add_habit, remove_habit）
- ドメインモデル: UserProfile, WannaBe, Goal, Habit, HabitLog, FailureReason, JournalEntry, WeeklyReview, BadgeDefinition, UserBadge
- リクエストモデル: UpsertWannaBeRequest, UpdateUserProfileRequest, CreateGoalRequest, CreateHabitRequest, UpdateHabitRequest, UpdateHabitLogRequest, VoiceInputRequest
- ダッシュボード集計型: HabitStat, WeeklyStats, HabitWithTodayStatus, DashboardData, VoiceInputResponse

### 2. カスタム例外クラスとエラーハンドラー

**作成ファイル**: `backend/app/core/exceptions.py`

- `AppError`, `NotFoundError`, `ForbiddenError`, `ConflictError` カスタム例外
- `register_exception_handlers()` で4種類のハンドラーを一括登録:
  - `RequestValidationError` → 422（日本語メッセージ）
  - `StarletteHTTPException` → ErrorResponse形式
  - `AppError` → ErrorResponse形式
  - `Exception` → 500 + サーバーログ記録

### 3. Supabase クライアント初期化

**作成ファイル**: `backend/app/core/supabase.py`

- `init_supabase()`: service_role キーでクライアント初期化（シングルトン）
- `get_supabase()`: 初期化済みクライアント取得
- `close_supabase()`: シャットダウン時のリソース解放
- 環境変数未設定時は警告ログ出力してスキップ

### 4. ルーター統合

**作成ファイル**: `backend/app/api/routes/__init__.py`

- `api_router` を `/api/v1` プレフィックス付きで作成
- 機能ルーターをここで集約（現在: me.router）

### 5. main.py 更新

**更新ファイル**: `backend/app/main.py`

- `lifespan` コンテキストマネージャーで Supabase 初期化・終了管理
- `register_exception_handlers(app)` でエラーハンドラー登録
- `api_router` に切り替え（個別ルーターから統合ルーターへ）
- `GET /` レスポンスに `version` と `docs` フィールド追加

### 6. テスト修正

**更新ファイル**: `backend/tests/test_security.py`

- TC-006, TC-004拡張: エラーレスポンス検証を `{"detail": ...}` から `{"error": {"message": ...}}` 形式に更新
  （TASK-0005共通基盤により、HTTPException が ErrorResponse 形式に変換されるようになったため）

## 作業結果

- [x] schemas.py 作成完了（全Pydanticモデル定義）
- [x] exceptions.py 作成完了（カスタム例外・エラーハンドラー）
- [x] supabase.py 作成完了（クライアント初期化）
- [x] routes/__init__.py 作成完了（ルーター統合）
- [x] main.py 更新完了（lifespan・エラーハンドラー・統合ルーター）
- [x] テスト修正・9/9 全通過

## 遭遇した問題と解決方法

### 問題1: 既存テストの ErrorResponse 形式不一致

- **発生状況**: TASK-0004 のテスト（TC-006, TC-004拡張）が `{"detail": ...}` を期待していたが、TASK-0005 のエラーハンドラーが `{"error": {"message": ...}}` に変換するようになった
- **解決方法**: テストの期待値を新しい ErrorResponse 形式に合わせて更新
- **学び**: 共通基盤変更はすべての既存テストへの影響を確認する必要がある

## 次のステップ

- `direct-verify` でサーバー起動・エンドポイント動作を確認
- TASK-0006 以降の各機能ルーター実装時は `api_router.include_router()` で追加
