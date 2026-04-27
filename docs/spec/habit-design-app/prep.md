# 習慣設計アプリ 準備タスク（ユーザー作業）

> **仕様**: [requirements.md](requirements.md)
> **生成日**: 2026-04-12

**【信頼性レベル凡例】**:
- 🔵 **青信号**: 要件定義書・ユーザーヒアリングで明確に必要と判明したタスク
- 🟡 **黄信号**: 要件定義書・設計文書から妥当に推測されるタスク
- 🔴 **赤信号**: 推測による予防的タスク（実装時に不要と判明する可能性あり）

---

## 必須（実装開始前に完了が必要）

以下のタスクが完了していないと、実装フェーズでブロッカーになります。

- [ ] **Anthropic APIキーの取得** 🔵 *ヒアリングQ8: 開発者がAPIキーを管理より*
  - Anthropic Console (https://console.anthropic.com) でAPIキーを発行
  - クレジット残高を確認し、開発・テスト分の予算を確保
  - 関連要件: REQ-604, NFR-101

- [ ] **Google OAuth クライアントIDの取得** 🔵 *REQ-101: Googleソーシャルログインより*
  - Google Cloud Console でOAuthアプリを作成
  - 承認済みリダイレクトURIに開発環境・本番環境のURLを登録
  - 関連要件: REQ-101

- [ ] **Apple Sign In の設定** 🔵 *REQ-102: Appleソーシャルログインより*
  - Apple Developer Program に登録（年間費用: $99）
  - App ID と Services ID を作成し、Sign In with Apple を有効化
  - 関連要件: REQ-102

---

## 推奨（実装中に用意できればOK）

実装を開始できますが、該当機能の実装前までに準備してください。

- [ ] **ホスティング環境の選定・アカウント作成** 🟡 *技術選定フェーズの成果物*
  - 技術設計フェーズで選定後（例: Vercel、Railway、Render等）にアカウント作成
  - 必要になるフェーズ: デプロイフェーズ
  - 関連要件: NFR-103（HTTPS）

- [ ] **データベースの選定・環境構築** 🟡 *技術選定フェーズの成果物*
  - 技術設計フェーズで選定後（例: Supabase、PlanetScale等）に環境構築
  - 必要になるフェーズ: バックエンド実装フェーズ
  - 関連要件: REQ-103, REQ-501

---

## 確認事項（判断が必要）

実装方針に影響するため、早めの判断・確認が推奨されます。

- [ ] **Claude API の使用モデルと料金試算** 🔵 *ヒアリングQ3: セキュリティ・API費用懸念より*
  - 背景: AIを中核に据えるためAPI費用が積み上がる可能性がある。学習目的で自分用ならclaude-haiku-4-5（低コスト）で十分か、claude-sonnet-4-6が必要かを判断
  - 選択肢: Haiku（低コスト・高速）/ Sonnet（中コスト・高品質）
  - 判断の影響: バックエンドのプロンプト設計とコスト設計に影響
  - 関連要件: REQ-604

- [ ] **技術スタックの選定** 🔵 *ヒアリングQ8: 技術選定を相談したいより*
  - 背景: Python・Claude・MCPの学習機会を重視。バックエンド言語・フレームワーク・DBの最終決定が必要
  - 推奨: `/tsumiki:kairo-design 習慣設計アプリ` を実行して技術設計フェーズで決定
  - 関連要件: 全体

- [ ] **Web Speech API の利用可否確認** 🟡 *REQ-401: 音声入力要件より*
  - 背景: ブラウザの音声認識（Web Speech API）はChrome/Edgeに限定される。ユーザーが主にどのブラウザを使用するか確認
  - 代替: 外部音声認識API（OpenAI Whisper等）の利用も検討
  - 関連要件: REQ-401, REQ-402

---

## サマリー

| 優先度 | 件数 | 🔵 | 🟡 | 🔴 |
|--------|------|-----|-----|-----|
| 必須 | 3 | 3 | 0 | 0 |
| 推奨 | 2 | 0 | 2 | 0 |
| 確認事項 | 3 | 2 | 1 | 0 |

---

## TASK-0003 実施記録（2026-04-13）

### Supabase セットアップ手順

#### ステップ1: Supabase プロジェクト作成

1. https://supabase.com にサインイン
2. 「New project」を作成
   - Project name: `habit-design-app`
   - Region: Northeast Asia (Tokyo)
3. 以下の認証情報を `backend/.env` と `frontend/.env` に記入:
   - `Settings > API > Project URL` → `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - `Settings > API > anon public` → `VITE_SUPABASE_ANON_KEY`
   - `Settings > API > service_role` → `SUPABASE_SERVICE_ROLE_KEY`
   - `Settings > API > JWT Secret` → `SUPABASE_JWT_SECRET`

#### ステップ2: DBスキーマ適用

1. Supabase ダッシュボード `SQL Editor` を開く
2. `docs/design/habit-design-app/setup-supabase.sql` の内容を**全選択してコピー**
3. SQL Editor に貼り付けて「RUN」を実行
4. 確認クエリを実行:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
   ```
   → 全テーブルの `rowsecurity` が `true` であることを確認

5. バッジデータ確認:
   ```sql
   SELECT id, name FROM public.badge_definitions ORDER BY condition_value;
   ```
   → 5件（streak_3, streak_7, streak_14, streak_30, streak_100）が表示されることを確認

#### ステップ3: Google OAuth 設定

1. [Google Cloud Console](https://console.cloud.google.com) でOAuth 2.0クライアントIDを作成
   - アプリケーションの種類: ウェブアプリケーション
   - 承認済みリダイレクトURI: `https://<project-ref>.supabase.co/auth/v1/callback`
2. Supabase `Authentication > Providers > Google` で有効化
   - Client ID と Client Secret を入力して保存

#### ステップ4: 完了確認

- [ ] Supabase ダッシュボードで全10テーブルが確認できること
- [ ] RLS が全テーブルで有効（rowsecurity = true）
- [ ] バッジ定義マスターデータ（5件）が投入されていること
- [ ] Google OAuth が設定されていること
- [ ] `frontend/.env` と `backend/.env` に認証情報が記入されていること

---

## 関連文書

- **要件定義書**: [requirements.md](requirements.md)
- **ヒアリング記録**: [interview-record.md](interview-record.md)
