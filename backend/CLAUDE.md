# バックエンド開発ガイド（Claude 向け）

> **全体調整ルールはルートの `/CLAUDE.md` を先に読むこと。**

FastAPI + Python 3.12 によるバックエンドプロジェクト。

## エージェント間の連携ルール

- `backend/` は Claude Code (TSUMIKI) が実装する。AIDesigner は読み取り専用。
- フロントエンド（`frontend-v2/`）も Claude Code が担当するため、API 変更はフロント実装側にもそのまま波及する。
- **API を変更したら必ず先にドキュメントを更新する**（フロント側で古い仕様を参照しないよう）
  - `docs/design/habit-design-app/api-endpoints.md` を更新
  - `docs/design/habit-design-app/interfaces.ts` を更新
  - 旧運用の名残として `/CODEX.md` の「Claude からの共有指示」に追記する慣行があったが、現行は不要（参照用に残置のみ）
- `backend/app/models/schemas.py` が型定義の「正」。`interfaces.ts` と常に整合させる。
- 新しいエンドポイントを追加した場合は Swagger UI (`/docs`) で動作確認してからフロント実装に進む。

## 開発コマンド

### アプリケーション実行

```bash
# 仮想環境を有効化
source .venv/bin/activate

# 開発サーバー起動（http://localhost:8000）
uvicorn app.main:app --reload

# API ドキュメント確認
open http://localhost:8000/docs
```

### テスト実行

```bash
# テスト実行（TASK-0004以降で追加予定）
pytest
```

## 環境変数

`.env.example` をコピーして `.env` を作成し、値を設定する：

```bash
cp .env.example .env
```

| 変数名 | 説明 |
|--------|------|
| `SUPABASE_URL` | Supabase プロジェクト URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key |
| `SUPABASE_JWT_SECRET` | Supabase JWT Secret |
| `ANTHROPIC_API_KEY` | Claude API キー |
| `RESEND_API_KEY` | Resend メール API キー |
| `FRONTEND_URL` | フロントエンド URL（デフォルト: http://localhost:5173） |

## 技術スタック

- **フレームワーク**: FastAPI 0.111
- **言語**: Python 3.12
- **サーバー**: uvicorn 0.29
- **DB/認証**: supabase-py 2.x
- **AI**: anthropic SDK 0.28
- **スケジューラー**: APScheduler 3.10
- **メール**: Resend 2.x
- **バリデーション**: Pydantic v2

## 注意事項

- Pydantic v2 を使用。`class Config:` の記法は不可
- `.venv/` はバージョン管理対象外
- `.env` はコミット禁止（`.env.example` のみコミット対象）
- uvicorn は必ず `backend/` ディレクトリ内から実行
