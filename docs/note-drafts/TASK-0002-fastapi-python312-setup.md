# FastAPI + Python 3.12 のバックエンド環境構築：仮想環境・依存管理・CORSの正しい設定

## この記事でわかること

- FastAPI プロジェクトの最小構成と「なぜ uvicorn か」
- Python バージョン管理で Homebrew を使うべき理由
- CORS 設定を環境変数で制御する設計パターン

---

## 背景：バックエンドの土台は「最小限・明示的・安全」が正義

フロントエンドと異なり、バックエンドの環境設定ミスはセキュリティホールに直結する。
特に CORS は「とりあえず `*` にしておく」が本番でそのままになりがちな危険な設定だ。

---

## 技術スタックの選定理由

| 技術 | 選定理由 |
|------|---------|
| FastAPI 0.111 | 型アノテーションベースの自動ドキュメント生成。非同期対応。Djangoより軽量 |
| Python 3.12 | パフォーマンス改善・型システム強化。3.11以上が推奨 |
| uvicorn | ASGI サーバーとしてデファクトスタンダード。`--reload` で開発効率が高い |
| pydantic v2 | FastAPI と完全統合。v1から破壊的変更あり・要注意 |
| python-dotenv | 環境変数の `.env` ファイル管理。12-Factor App 準拠 |

---

## 実装のポイント

### 1. Python バージョン管理は Homebrew で明示的に

```bash
brew install python@3.12
# シンボリックリンク確認
python3.12 --version

# 仮想環境はプロジェクト内に閉じ込める
python3.12 -m venv .venv
source .venv/bin/activate
```

macOS のシステム Python（3.9.x）を汚染しないために、プロジェクトごとに仮想環境を作る。
`.venv` を `.gitignore` に入れることを忘れずに。

### 2. CORS は環境変数で制御する

```python
# app/main.py
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],  # ← * ではなく明示的に
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**なぜ `*` ではないか：**
- `allow_credentials=True` と `allow_origins=["*"]` の組み合わせは FastAPI がエラーを出す（仕様）
- 本番で Origin を絞らないと、任意のサイトからクッキー付きリクエストが飛んでくる

### 3. Pydantic v2 の破壊的変更に注意

```python
# NG（v1の書き方）
class Settings(BaseModel):
    class Config:
        env_file = ".env"

# OK（v2の書き方）
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    model_config = {"env_file": ".env", "extra": "ignore"}
```

v2 では `class Config:` が廃止。`pydantic-settings` が別パッケージに分離された。
`requirements.txt` に `pydantic-settings` を明示しないとインポートエラーになる。

### 4. requirements.txt はバージョンをピン留めする

```
fastapi==0.111.*
uvicorn[standard]==0.29.*
python-jose[cryptography]==3.3.*
pydantic==2.*
pydantic-settings  # ← 忘れやすい
```

マイナーバージョンまでピン留めすることで、CI/CD の再現性が上がる。
`.*` 記法で「パッチは自動更新・メジャーは固定」という意図を表現できる。

---

## ハマったこと：システム Python とのバージョン衝突

macOS のデフォルト Python は 3.9.6。
FastAPI 0.111 は Python 3.11+ が事実上の推奨で、3.9 だと型ヒントの挙動が異なる部分がある。

```bash
# 確認コマンド
python3 --version  # → 3.9.6（システム）
python3.12 --version  # → 3.12.x（Homebrew）
```

`python3.12 -m venv .venv` で明示的にバージョンを指定することで解決。

---

## アーキテクト視点のまとめ

バックエンドの環境構築で意識したのは「**本番との差分を最小化する**」こと。

- CORS を `*` にしない → 本番でそのまま使えるホワイトリスト設計
- 環境変数で制御 → 12-Factor App の原則に従い、コードと設定を分離
- バージョンをピン留め → 「自分のマシンでは動いた」を防ぐ

**次回**: Supabase のセットアップとRLSポリシー設計編
