# 習慣設計アプリ

「未来の自分から逆算して習慣を設計し、トラッキングする」個人目標達成支援アプリ。

## 技術スタック

- **フロントエンド**: React 18 + Vite + TypeScript + Tailwind CSS
- **バックエンド**: FastAPI (Python 3.11+)
- **DB・認証**: Supabase (PostgreSQL + Auth)
- **AI**: Claude API (Anthropic)
- **ホスティング**: Vercel (FE) + Railway (BE)

## セットアップ

### フロントエンド

```bash
cd frontend
npm install
cp .env.example .env
# .env に実際の値を設定
npm run dev
```

### 環境変数（frontend/.env）

```
VITE_SUPABASE_URL=<Supabase Project URL>
VITE_SUPABASE_ANON_KEY=<Supabase Anon Key>
VITE_API_BASE_URL=http://localhost:8000
```

### バックエンド

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# .env に実際の値を設定
uvicorn app.main:app --reload
```

## 開発コマンド

### フロントエンド

```bash
# 開発サーバー起動
cd frontend && npm run dev

# ビルド
cd frontend && npm run build

# 型チェック
cd frontend && npm run tsc
```

## ドキュメント

- [要件定義](docs/spec/habit-design-app/requirements.md)
- [アーキテクチャ設計](docs/design/habit-design-app/architecture.md)
- [API仕様](docs/design/habit-design-app/api-endpoints.md)
- [DBスキーマ](docs/design/habit-design-app/database-schema.sql)
- [タスク一覧](docs/tasks/habit-design-app/overview.md)
