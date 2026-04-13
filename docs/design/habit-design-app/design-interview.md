# 習慣設計アプリ 設計ヒアリング記録

**作成日**: 2026-04-12
**ヒアリング実施**: step4 設計ヒアリング

## ヒアリング目的

新規プロジェクトのため技術スタックが未確定。要件定義書をもとに、設計判断に必要な技術選定をヒアリングで確定した。

---

## 質問と回答

### Q1: バックエンド技術構成

**質問日時**: 2026-04-12
**カテゴリ**: 技術選択
**背景**: Python/Claude/MCP学習目的の記載があり、バックエンドの言語・フレームワーク選定が設計全体に影響するため

**回答**: Python + FastAPI

**信頼性への影響**:
- バックエンド全体の構成（`backend/` ディレクトリ、requirements.txt等）が 🔵 に確定
- Claude API との統合は `anthropic` Python SDK を使用することが確定

---

### Q2: データベース・認証基盤

**質問日時**: 2026-04-12
**カテゴリ**: 技術選択
**背景**: REQ-101/102（Google/Apple OAuth）の実装方法と、データ分離（NFR-102）の実現方法の確定が必要なため

**回答**: Supabase（PostgreSQL + Auth）

**信頼性への影響**:
- DBスキーマの Supabase 前提設計（RLS ポリシー、`auth.users` 連携）が 🔵 に確定
- Google・Apple OAuth は Supabase Auth で実装することが確定
- NFR-102（データ分離）は RLS で実現することが確定

---

### Q3: フロントエンド技術

**質問日時**: 2026-04-12
**カテゴリ**: 技術選択
**背景**: Python バックエンドとの組み合わせとして最適なフロントエンド構成を確定するため

**回答**: React + Vite（TypeScript）

**信頼性への影響**:
- `interfaces.ts` の TypeScript 型定義ファイルの作成が 🔵 に確定
- フロントエンドは `frontend/` ディレクトリ構成が確定

---

### Q4: 通知・リマインダー実装方法

**質問日時**: 2026-04-12
**カテゴリ**: 技術選択
**背景**: REQ-801（リマインダー通知）の実装方法を確定するため。Web Push か メール か で実装複雑度が大きく変わる

**回答**: メール通知のみ（Resend を使用）

**信頼性への影響**:
- REQ-801 の実装方法が「Resend メール送信」として 🔵 に確定
- Web Push API の実装は不要（設計スコープ外）

---

### Q5: AI応答のストリーミング

**質問日時**: 2026-04-12
**カテゴリ**: パフォーマンス
**背景**: NFR-002（AI応答30秒以内またはストリーミング）の実装方針を確定するため。ストリーミング実装はUX向上に効果的だが、実装複雑度が上がる

**回答**: ストリーミング実装する

**信頼性への影響**:
- AI関連エンドポイント（`/ai/weekly-review/stream`, `/wanna-be/analyze`）は SSE（Server-Sent Events）で実装することが 🔵 に確定
- フロントエンドの状態管理に SSE 対応のロジックが必要であることが確定

---

### Q6: デプロイメント環境

**質問日時**: 2026-04-12
**カテゴリ**: インフラ
**背景**: HostingはCORS設定やHTTPS証明書、環境変数管理に影響するため確定が必要

**回答**: フロントエンド: Vercel / バックエンド: Railway

**信頼性への影響**:
- CORS許可オリジンが Vercel ドメインに確定（🔵）
- Claude API キーは Railway の環境変数に設定（NFR-101、🔵）
- HTTPS は Vercel・Railway 両方で自動設定（NFR-103、🔵）

---

## ヒアリング結果サマリー

### 確定した技術スタック

| 要素 | 決定事項 |
|------|---------|
| バックエンド | Python 3.11+ + FastAPI |
| フロントエンド | React 18 + Vite + TypeScript |
| DB・認証 | Supabase（PostgreSQL + Auth） |
| AI統合 | Claude API（anthropic Python SDK）+ SSEストリーミング |
| メール | Resend |
| FE デプロイ | Vercel |
| BE デプロイ | Railway |

### 設計方針の決定事項

- AI関連エンドポイントは全て SSE（Server-Sent Events）でストリーミング応答
- Claude APIキーは Railway 環境変数のみで管理（クライアント露出禁止）
- Supabase RLS で全テーブルのユーザーデータ分離を強制
- 通知はメール（Resend）のみ。Web Push は MVP スコープ外

### 残課題

- MCP（Model Context Protocol）の活用方法は設計・実装フェーズで検討
- Web Speech API のブラウザ対応制限（Chrome/Edge のみ）への対応方針
- ストリーク計算のサーバーサイドロジック詳細（タイムゾーン考慮）

### 信頼性レベル分布

**ヒアリング前（推定）**:
- 🔵 青信号: 5件
- 🟡 黄信号: 20件
- 🔴 赤信号: 15件

**ヒアリング後**:
- 🔵 青信号: 36件 (+31件)
- 🟡 黄信号: 15件 (-5件)
- 🔴 赤信号: 0件 (-15件)

---

## 関連文書

- **アーキテクチャ設計**: [architecture.md](architecture.md)
- **データフロー**: [dataflow.md](dataflow.md)
- **型定義**: [interfaces.ts](interfaces.ts)
- **DBスキーマ**: [database-schema.sql](database-schema.sql)
- **API仕様**: [api-endpoints.md](api-endpoints.md)
- **要件定義**: [requirements.md](../../spec/habit-design-app/requirements.md)
