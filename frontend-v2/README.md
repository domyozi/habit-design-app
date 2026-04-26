# Daily OS v2 — 習慣設計アプリ

朝・夜のルーティン管理、月次レビュー、Wanna Be 目標設定、AI支援を統合したパーソナル習慣設計アプリ。

## 機能

- **朝ルーティン**: Must習慣 / 準備ルーティンのチェック、体重・体調記録、Claude AIコメント
- **夜ルーティン**: 振り返り・準備チェック、Gap/Insight/明日の一手記録、AIコメント
- **月次レビュー**: 今月 / 先月 / ベストの3軸比較、週別チャート（W1-W4）、Wanna Be AI分析（ストリーミング）
- **設定・AI支援**: AIとの対話で習慣リストを設計、Wanna Be 目標管理
- **データ**: 日次データは localStorage に保存。AI機能は認証済みバックエンド経由で実行

## Vercel へのデプロイ

### 1. Vercel プロジェクト設定

| 項目 | 値 |
|------|-----|
| Framework Preset | Vite |
| Root Directory | `frontend-v2` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

### 2. 環境変数

Vercel の Project Settings → Environment Variables に追加:

```
VITE_API_BASE_URL = https://your-backend.example.com
```

> **注意**: Anthropic API Key はフロントエンドに設定しません。
> バックエンドの環境変数 `ANTHROPIC_API_KEY` にだけ設定してください。

### 3. SPA ルーティング

`vercel.json` により、すべてのパスを `index.html` にリライトする設定済みです。

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

## ローカル開発

```bash
cd frontend-v2
npm install

# 環境変数を設定
cp .env.example .env.local
# .env.local に VITE_API_BASE_URL=http://localhost:8000 を記入

npm run dev       # 開発サーバー起動
npm run build     # 本番ビルド
npm run lint      # Lint チェック
```

## 環境変数

| 変数名 | 説明 | 必須 |
|--------|------|------|
| `VITE_API_BASE_URL` | バックエンド API の URL | AI/API機能使用時 |

## localStorage スキーマ

| キー | 内容 |
|------|------|
| `daily:{YYYY-MM-DD}:morning:checked` | 朝チェック済みID配列 |
| `daily:{YYYY-MM-DD}:morning:weight` | 朝体重 (kg) |
| `daily:{YYYY-MM-DD}:morning:condition` | 朝体調 (1-5) |
| `daily:{YYYY-MM-DD}:morning:report` | 朝日報テキスト |
| `daily:{YYYY-MM-DD}:evening:checked` | 夜チェック済みID配列 |
| `daily:{YYYY-MM-DD}:evening:weight` | 夜体重 (kg) |
| `daily:{YYYY-MM-DD}:evening:condition` | 夜体調 (1-5) |
| `daily:{YYYY-MM-DD}:evening:gap` | 振り返り Gap |
| `daily:{YYYY-MM-DD}:evening:insight` | 振り返り Insight |
| `daily:{YYYY-MM-DD}:evening:tomorrow` | 明日の一手 |
| `daily:{YYYY-MM-DD}:evening:report` | 夜日報テキスト |
| `boss:{YYYY-MM-DD}` | 今日のBoss（最重要タスク） |
| `monthly:{YYYY-MM}:targets` | 月間目標設定 |
| `wannabe:goals` | Wanna Be 目標リスト |
| `settings:ai:habits` | AIが提案した習慣リスト |
| `settings:ai:context` | AI設定チャット履歴 |

## 技術スタック

- React 18 + TypeScript
- Vite
- Tailwind CSS v4
- Anthropic Claude API（Haiku / Sonnet）
