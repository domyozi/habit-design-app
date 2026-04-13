# 習慣設計アプリ 開発コンテキスト

**作成日**: 2026-04-12
**プロジェクト**: habit-design-app
**フェーズ**: 設計完了 / 実装開始前

---

## プロジェクト概要

「未来の自分から逆算して習慣を設計し、トラッキングする」Webアプリ。
ユーザーが「なりたい自分（Wanna Be）」を入力すると、Claude AIが習慣候補を提案し、日々のトラッキングと週次レビューで継続を支援する。

---

## 技術スタック

### フロントエンド

| 要素 | 技術 |
|------|------|
| フレームワーク | React 18 + Vite |
| 言語 | TypeScript |
| スタイリング | Tailwind CSS |
| ルーティング | React Router v6 |
| サーバー状態管理 | TanStack Query (React Query) |
| クライアント状態 | Zustand |
| フォーム | React Hook Form |
| 認証クライアント | @supabase/supabase-js |

### バックエンド

| 要素 | 技術 |
|------|------|
| フレームワーク | FastAPI (Python 3.11+) |
| AI連携 | anthropic SDK (Claude API, SSE streaming) |
| DB連携 | supabase-py |
| 認証検証 | python-jose + Supabase JWT |
| メール送信 | resend |
| スケジューラー | APScheduler |

### インフラ

| 要素 | 技術 |
|------|------|
| データベース | Supabase (PostgreSQL + RLS) |
| 認証 | Supabase Auth (Google / Apple OAuth) |
| FEホスティング | Vercel |
| BEホスティング | Railway |

---

## ディレクトリ構造

```
habit-design-app/
├── frontend/                    # React + Vite フロントエンド
│   ├── src/
│   │   ├── components/          # 再利用可能なUIコンポーネント
│   │   │   ├── ui/              # 基本UIパーツ（Button, Modal, Toast等）
│   │   │   ├── habits/          # 習慣関連コンポーネント
│   │   │   ├── badges/          # バッジ・ゲーミフィケーション
│   │   │   ├── dashboard/       # ダッシュボード関連
│   │   │   └── ai/              # AIフィードバック・SSE表示
│   │   ├── pages/               # ルートページコンポーネント
│   │   │   ├── Login.tsx        # ログイン画面
│   │   │   ├── Onboarding.tsx   # オンボーディング（初回WannaBe設定）
│   │   │   ├── Dashboard.tsx    # ダッシュボード（今日のルーティン）
│   │   │   ├── WannaBe.tsx      # Wanna Be設定・AI分析
│   │   │   ├── Goals.tsx        # 長期目標管理
│   │   │   ├── WeeklyReview.tsx # 週次レビュー
│   │   │   ├── Tracking.tsx     # 習慣トラッキング可視化
│   │   │   └── Settings.tsx     # 設定・通知設定
│   │   ├── hooks/               # カスタムフック
│   │   │   ├── useAuth.ts       # 認証状態管理
│   │   │   ├── useHabits.ts     # 習慣データフック
│   │   │   ├── useSSE.ts        # SSEストリーミングフック
│   │   │   └── useSpeech.ts     # Web Speech APIフック
│   │   ├── store/               # Zustandストア
│   │   │   ├── authStore.ts     # 認証状態
│   │   │   └── habitStore.ts    # 習慣状態
│   │   ├── lib/                 # APIクライアント・ユーティリティ
│   │   │   ├── api.ts           # FastAPI呼び出し共通関数
│   │   │   └── supabase.ts      # Supabaseクライアント初期化
│   │   ├── types/               # TypeScript型定義
│   │   │   └── index.ts
│   │   ├── App.tsx              # ルート定義（React Router）
│   │   └── main.tsx
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── backend/                     # FastAPI バックエンド
│   ├── app/
│   │   ├── api/
│   │   │   └── routes/
│   │   │       ├── auth.py
│   │   │       ├── users.py
│   │   │       ├── wanna_be.py
│   │   │       ├── goals.py
│   │   │       ├── habits.py
│   │   │       ├── habit_logs.py
│   │   │       ├── voice_input.py
│   │   │       ├── ai_coach.py
│   │   │       └── notifications.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── security.py
│   │   │   └── supabase.py
│   │   ├── services/
│   │   │   ├── ai_service.py
│   │   │   ├── voice_classifier.py
│   │   │   └── email_service.py
│   │   ├── models/
│   │   │   └── schemas.py
│   │   └── main.py
│   ├── scheduler/
│   │   └── weekly_review.py
│   ├── requirements.txt
│   └── .env.example
│
└── docs/
    ├── spec/
    ├── design/
    └── tasks/
```

---

## ルーティング定義

React Router v6 による SPA ルーティング（`frontend/src/App.tsx` で定義）:

| パス | ページコンポーネント | 認証 | 説明 |
|------|---------------------|------|------|
| `/login` | `Login.tsx` | 不要 | Googleログイン |
| `/onboarding` | `Onboarding.tsx` | 必要 | 初回Wanna Be入力 + AI分析 |
| `/` | `Dashboard.tsx` | 必要 | 今日のルーティン + 週次統計 |
| `/wanna-be` | `WannaBe.tsx` | 必要 | Wanna Be設定・AI分析ストリーミング |
| `/goals` | `Goals.tsx` | 必要 | 長期目標一覧・管理 |
| `/weekly-review` | `WeeklyReview.tsx` | 必要 | 週次レビュー + AIフィードバック |
| `/tracking` | `Tracking.tsx` | 必要 | 習慣達成率グラフ・カレンダー |
| `/settings` | `Settings.tsx` | 必要 | プロフィール・通知設定・バッジ |

---

## 認証フロー

1. 未認証ユーザーは `/login` にリダイレクト
2. Google OAuth → Supabase Auth → JWT 発行
3. JWT を `authStore` で管理（Zustand）
4. 全 API リクエストの `Authorization: Bearer <jwt>` ヘッダーに付与
5. 初回ログイン後 → `/onboarding` に遷移（Wanna Be 未設定の場合）
6. Wanna Be 設定済み → `/`（ダッシュボード）に遷移

---

## APIエンドポイント概要

バックエンド URL: `VITE_API_URL` 環境変数で設定（Railway URL）

| カテゴリ | ベースパス |
|---------|-----------|
| ユーザー | `GET/PATCH /users/me` |
| Wanna Be | `GET/POST/DELETE /wanna-be` |
| 目標 | `GET/POST/PUT/DELETE /goals` |
| 習慣 | `GET/POST/PUT/DELETE /habits` |
| 習慣ログ | `POST /habit-logs`, `GET /habit-logs/today`, `GET /habit-logs/streak/{id}` |
| AI分析 | `GET /ai/analyze-wanna-be` (SSE), `GET /ai/weekly-review` (SSE) |
| 音声入力 | `POST /voice/classify` |
| バッジ | `GET /user-badges`, `GET /badge-definitions` |
| 週次レビュー | `GET/POST /weekly-reviews` |
| 通知 | `GET/PATCH /notifications/settings` |

---

## 主要な設計上の制約

- **NFR-101**: Claude API キーはバックエンドのみ（フロントエンドに露出禁止）
- **NFR-102**: Supabase RLS でユーザーは自分のデータのみアクセス可能
- **REQ-303**: AI が変更できるのは「追加・削除・時間帯変更」のみ
- **REQ-605**: Claude API へ送信するのは習慣パターン・統計のみ（個人情報送信禁止）
- **EDGE-001**: Claude API 障害時でも習慣トラッキングは継続動作
- **音声入力**: Web Speech API（Chrome/Edge のみ対応）

---

## 関連設計文書

- **要件定義**: `docs/spec/habit-design-app/requirements.md`
- **ユーザーストーリー**: `docs/spec/habit-design-app/user-stories.md`
- **受け入れ条件**: `docs/spec/habit-design-app/acceptance-criteria.md`
- **アーキテクチャ**: `docs/design/habit-design-app/architecture.md`
- **DBスキーマ**: `docs/design/habit-design-app/database-schema.sql`
- **API仕様**: `docs/design/habit-design-app/api-endpoints.md`
- **型定義**: `docs/design/habit-design-app/interfaces.ts`
- **タスク概要**: `docs/tasks/habit-design-app/overview.md`
