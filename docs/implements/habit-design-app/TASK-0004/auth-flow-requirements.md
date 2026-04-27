# 認証フロー実装 要件定義書

**タスクID**: TASK-0004
**機能名**: auth-flow
**作成日**: 2026-04-13

---

## 1. 機能の概要

- 🔵 **何をする機能か**: Supabase Auth を使用した Google OAuth ログイン機能をフロントエンドに実装し、バックエンドに JWT 検証ミドルウェアを実装する
- 🔵 **解決する問題**: ユーザーがアプリに安全にログインでき、バックエンドが認証済みユーザーのみAPIアクセスを許可できるようにする
- 🔵 **想定ユーザー**: 習慣設計アプリを使用する一般ユーザー（REQ-101: Googleアカウント保有者）
- 🔵 **システム内での位置づけ**: フロントエンド（React + Zustand）→ Supabase Auth → バックエンド（FastAPI JWT検証）の認証基盤。後続の全APIエンドポイントが `get_current_user` 依存関数を使用する

**参照したEARS要件**: REQ-101, REQ-102, NFR-101, NFR-102
**参照した設計文書**: `docs/design/habit-design-app/architecture.md` セキュリティ設計セクション

---

## 2. 入力・出力の仕様

### バックエンド: verify_token()

- 🔵 **入力**: `token: str`（SupabaseのJWT文字列）
- 🔵 **出力**: `Optional[str]`（user_id UUID文字列 または None）
- 🔵 **検証内容**:
  - アルゴリズム: `HS256`
  - audience: `"authenticated"`（Supabase固定値）
  - 署名: `SUPABASE_JWT_SECRET` で検証
  - 有効期限: `exp` クレームが現在時刻より未来

### バックエンド: get_current_user()

- 🔵 **入力**: `Authorization: Bearer <token>` ヘッダー（FastAPI HTTPBearer経由）
- 🔵 **出力**: `str`（user_id）、失敗時は `HTTPException(401)`
- 🔵 **用途**: 全認証必須エンドポイントで `Depends(get_current_user)` として使用

### フロントエンド: authStore

- 🔵 **状態**: `session: Session | null`, `user: User | null`, `isLoading: boolean`
- 🔵 **signIn()**: `supabase.auth.signInWithOAuth({ provider: 'google' })` → リダイレクト
- 🔵 **signOut()**: `supabase.auth.signOut()` → セッションクリア
- 🔵 **initialize()**: `getSession()` + `onAuthStateChange()` でセッション同期

**参照したEARS要件**: REQ-101, NFR-101
**参照した設計文書**: `docs/design/habit-design-app/interfaces.ts`, `docs/design/habit-design-app/api-endpoints.md`

---

## 3. 制約条件

- 🔵 **セキュリティ（NFR-101）**: Anthropic API キーと同様、JWT Secret はバックエンドのみで保持。フロントエンドに露出禁止
- 🔵 **セキュリティ（NFR-102）**: 全APIエンドポイントで JWT 検証必須。公開エンドポイント（`/`, `/health`）のみ除外
- 🔵 **JWT仕様**: Supabase発行JWT、アルゴリズムHS256、audience="authenticated"、subクレームがuser_id
- 🔵 **パフォーマンス（NFR-001）**: JWT検証は純粋な暗号処理のみ（DB参照なし）→ 2秒以内は自明
- 🟡 **フロントエンド**: セッションはブラウザ（localStorage）に永続化される（Supabase JS SDK デフォルト動作）
- 🔵 **リダイレクト**: コールバックURL `http://localhost:5173/auth/callback` をSupabase Redirect URLsに登録が必要

**参照したEARS要件**: NFR-101, NFR-102, NFR-001
**参照した設計文書**: `docs/design/habit-design-app/architecture.md` セキュリティ制約セクション

---

## 4. 想定される使用例

### 正常系

- 🔵 **Google ログイン**: ユーザーが「Googleでログイン」をクリック → Supabase OAuth リダイレクト → コールバック処理 → セッション確立 → ダッシュボードへ
- 🔵 **ページリロード後のセッション維持**: `initialize()` が `getSession()` でセッション復元 → 再ログイン不要
- 🔵 **認証済みAPIアクセス**: フロントエンドが `session.access_token` をヘッダーに付与 → バックエンドがJWT検証 → user_id取得 → 正常レスポンス

### 異常系（エラーケース）

- 🔵 **無効トークン**: 署名が不正なJWT → `verify_token()` が `None` 返却 → `get_current_user()` が `401` 返却
- 🔵 **期限切れトークン**: `exp` が過去 → `verify_token()` が `None` 返却 → `401`
- 🔵 **ヘッダーなしアクセス**: `Authorization` ヘッダー未付与 → FastAPI HTTPBearer が `403` 返却
- 🟡 **ネットワークエラー時のOAuth**: Supabase SDK が自動ハンドリング

**参照したEARS要件**: NFR-102, EDGE-001, EDGE-003
**参照した設計文書**: `docs/design/habit-design-app/api-endpoints.md` エラーレスポンス共通フォーマット

---

## 5. EARS要件・設計文書との対応関係

- **参照した機能要件**: REQ-101（Google OAuth）, REQ-102（Apple OAuth ※後続タスク）
- **参照した非機能要件**: NFR-001（2秒以内）, NFR-101（APIキー保護）, NFR-102（データ分離・JWT検証）
- **参照したEdgeケース**: EDGE-001（API呼び出し失敗）, EDGE-003（認証エラー）
- **参照した設計文書**:
  - **アーキテクチャ**: `docs/design/habit-design-app/architecture.md` セキュリティ設計
  - **API仕様**: `docs/design/habit-design-app/api-endpoints.md` 認証ヘッダー共通仕様
  - **型定義**: `docs/design/habit-design-app/interfaces.ts`（UserProfile）
  - **データベース**: `docs/design/habit-design-app/database-schema.sql`（user_profiles テーブル）

---

## 品質判定

- **要件の曖昧さ**: なし ✅
- **入出力定義**: 完全 ✅
- **制約条件**: 明確 ✅
- **実装可能性**: 確実 ✅
- **信頼性レベル**: 🔵 10件 (83%), 🟡 2件 (17%), 🔴 0件 → **高品質**
