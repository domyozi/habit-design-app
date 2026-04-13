---
name: 習慣設計アプリ プロジェクト概要
description: 習慣設計アプリの要件定義完了。AIコーチ体験をコアとしたWebアプリ。Claude/MCP/Python学習兼用プロジェクト
type: project
originSessionId: 5bf2c511-4300-421b-ab21-52cd07544cf5
---
## 習慣設計アプリ

**Why**: ユーザー自身のClaude・MCP・Python学習を兼ねた個人プロジェクト。AIを中核に据えた差別化が目的

**状態**: 技術設計フェーズ完了（2026-04-12）

**コアコンセプト**: 未来の自分（Wanna Be）から逆算して習慣を設計し、AIコーチが毎日フィードバックする

**ターゲット**: 自己成長志向のビジネスパーソン（20〜40代）

**確定事項**:
- プラットフォーム: Webアプリ優先（モバイルは後続）
- AI: Claude API、開発者がAPIキーを管理
- 認証: Googleソーシャルログイン（Apple も含む）
- 課金: なし（学習・検証目的）
- 音声入力: 汎用入力でAIが自動分類（ジャーナリング/日報/チェックリスト/KPI）

**Key Features（MVP）**:
1. Wanna Be設定（初期登録→AI提案→少しずつ編集）
2. 習慣トラッキング＋可視化（チェックリスト＋ストリーク）
3. AIコーチ体験（週次レビュー・改善提案）
4. 音声入力で自動分類

**AI制約**: AI変更は習慣の追加・削除・時間帯変更の範囲内のみ

**確定技術スタック**:
- フロントエンド: React 18 + Vite + TypeScript（Vercel）
- バックエンド: Python 3.11+ + FastAPI（Railway）
- DB・認証: Supabase（PostgreSQL + RLS + Google/Apple OAuth）
- AI: Claude API + anthropic Python SDK（SSEストリーミング）
- メール通知: Resend

**ドキュメント**:
- 要件定義書: `docs/spec/habit-design-app/`
- 技術設計書: `docs/design/habit-design-app/`（architecture.md / dataflow.md / interfaces.ts / database-schema.sql / api-endpoints.md）

**How to apply**: 技術選定・実装時はこのスタックを前提に提案する
