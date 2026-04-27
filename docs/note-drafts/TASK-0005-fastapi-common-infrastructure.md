# FastAPI 共通基盤：「全エンドポイントでエラー形式を統一する」ための設計パターン

## この記事でわかること

- Pydantic v2 のジェネリック型で型安全なAPIレスポンスを作る方法
- FastAPI の例外ハンドラーで全エラーを統一フォーマットに揃える方法
- lifespan コンテキストマネージャーによるリソース管理（Supabase クライアント）

---

## 背景：「APIを叩くたびにエラー形式が違う」問題

フロントエンドからAPIを使う開発者が最も困ることの一つは、エラー形式の不統一だ。

```json
// バリデーションエラーは FastAPI デフォルト
{"detail": [{"loc": ["body", "text"], "msg": "field required"}]}

// 認証エラーは HTTPException のデフォルト  
{"detail": "Invalid or expired token"}

// アプリ独自エラーは自前のフォーマット
{"error": "not found"}
```

フロントエンドがこれをハンドリングするためには、エラー形式ごとに分岐を書く必要がある。最悪だ。

**解決策**: すべてのエラーを1つの形式に統一する共通基盤を作る。

---

## 設計：APIResponse[T] ジェネリック型

```python
# backend/app/models/schemas.py
T = TypeVar("T")

class APIResponse(BaseModel, Generic[T]):
    success: bool
    data: Optional[T] = None
    message: str = ""

class ErrorDetail(BaseModel):
    code: str
    message: str

class ErrorResponse(BaseModel):
    success: bool = False
    error: ErrorDetail
```

**設計のポイント**:

- `APIResponse[T]` のジェネリック型で、どのデータ型のレスポンスも型安全に表現できる
- `ErrorResponse` は `success: False` と `error` フィールドを持つ
- フロントエンドの `interfaces.ts` と1対1に対応させることで、型安全性を維持

### TypeScript 側との対応

```typescript
// frontend/src/types/interfaces.ts
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}
```

Python 側と TypeScript 側のスキーマを対応させておくことで、「APIの形が変わった」ことをコンパイル時に検出できる。

---

## 実装：例外ハンドラーの統一

### 4種類のエラーを1か所で管理

```python
# backend/app/core/exceptions.py
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

def register_exception_handlers(app: FastAPI) -> None:
    """全エラーハンドラーをここで一括登録"""
    
    @app.exception_handler(RequestValidationError)
    async def validation_handler(request, exc):
        # 422: Pydantic バリデーションエラーを日本語化
        ...

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(request, exc):
        # 401/403/404 等を ErrorResponse 形式に変換
        ...

    @app.exception_handler(AppError)
    async def app_error_handler(request, exc):
        # ビジネスロジック例外を ErrorResponse 形式に変換
        ...

    @app.exception_handler(Exception)
    async def unexpected_handler(request, exc):
        # 予期せぬ例外: 500 + サーバーログ記録
        logger.exception("予期せぬエラー: %s", str(exc))
        ...
```

**設計のポイント**:

- `RequestValidationError` と `StarletteHTTPException` は別クラス。両方ハンドリングしないと抜けが生じる
- `Exception` ハンドラーは「最後の砦」。詳細はログに記録し、クライアントには最小限の情報だけ返す
- `register_exception_handlers(app)` として関数化することで、`main.py` が肥大化しない

### バリデーションエラーの日本語化

```python
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    errors = exc.errors()
    if errors:
        first_error = errors[0]
        loc = " → ".join(str(l) for l in first_error.get("loc", []))
        msg = first_error.get("msg", "入力値が不正です")
        detail_message = f"入力値エラー: {loc}: {msg}" if loc else msg
    else:
        detail_message = "入力値が不正です"
    
    return JSONResponse(
        status_code=422,
        content=ErrorResponse(
            error=ErrorDetail(code="VALIDATION_ERROR", message=detail_message)
        ).model_dump(),
    )
```

デフォルトの FastAPI バリデーションエラーはこんな感じで英語で返ってくる:

```json
{
  "detail": [
    {"loc": ["body", "text"], "msg": "Field required", "type": "missing"}
  ]
}
```

日本語ユーザー向けには読みにくい。`入力値エラー: body → text: Field required` のように整形して返すことで UX が上がる。

---

## lifespan によるリソース管理

FastAPI 0.93以降、`@app.on_event("startup")` は非推奨になった。
代わりに `lifespan` コンテキストマネージャーを使う。

```python
# backend/app/main.py
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 【起動時】Supabase クライアントを初期化
    init_supabase()
    yield
    # 【終了時】リソースを解放
    close_supabase()

app = FastAPI(lifespan=lifespan)
```

**なぜこのパターンか**:

- `yield` を境に「起動処理」と「終了処理」を同一関数内に書ける
- テスト時に `lifespan` をモックしやすい
- Python の `contextlib.asynccontextmanager` を使うため、追加ライブラリ不要

### Supabase クライアントのシングルトン管理

```python
# backend/app/core/supabase.py
_supabase_client: Optional[Client] = None

def init_supabase() -> Client:
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client
    
    if not settings.SUPABASE_URL:
        logger.warning("SUPABASE_URL が未設定。スキップします。")
        return None  # 開発環境での起動を妨げない
    
    _supabase_client = create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_SERVICE_ROLE_KEY,
    )
    return _supabase_client
```

**重要な設計判断**:

- `SUPABASE_URL` 未設定時は警告だけ出してスキップ → 環境変数がない開発初期でも `uvicorn` が起動できる
- service_role キー使用 → バックエンドは RLS をバイパスしてビジネスロジックを実行
- シングルトン → 毎リクエストでクライアントを再生成しない

---

## ルーター統合パターン

機能が増えるほど `main.py` へのルーター登録が増えていく。これを防ぐために統合ルーターを用意する。

```python
# backend/app/api/routes/__init__.py
from fastapi import APIRouter
from app.api.routes import me, habits, goals  # 今後追加されていく

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(me.router, tags=["auth"])
api_router.include_router(habits.router, tags=["habits"])
# ...
```

```python
# backend/app/main.py (main.py は1行追加するだけ)
from app.api.routes import api_router
app.include_router(api_router)
```

**設計のポイント**:

- `main.py` は「アプリの組み立て」に専念し、「何のルーターがあるか」の詳細を持たない
- 新機能追加時は `__init__.py` に1行追加するだけ
- チームで開発するとき、各機能担当者が `__init__.py` に `include_router` を追加するだけで統合される

---

## ハマったこと：既存テストへの影響

共通エラーハンドラーを追加した結果、TASK-0004 で書いたテストが壊れた。

```python
# テスト（TASK-0004時点）
assert data["detail"] == "Invalid or expired token"

# 共通基盤追加後（TASK-0005）
assert data["error"]["message"] == "Invalid or expired token"  # ErrorResponse形式
assert data["success"] is False
```

**学び**: 共通基盤の変更は既存テストに影響する。変更後は必ず全テストを実行して確認する。
逆に言えば、**テストがあったからこそ即座に気づけた**。テストなしだったら、どこかのタイミングでフロントエンドが壊れるまで気づかなかっただろう。

---

## アーキテクト視点のまとめ

共通基盤で意識したこと：

1. **エラー形式の統一** — フロントエンドがエラー処理で分岐しなくて済むように
2. **lifespan パターン** — 起動・終了処理を一か所に凝集
3. **ルーター統合** — `main.py` の肥大化を防ぐ
4. **シングルトンクライアント** — DB接続の効率化と管理の一元化

> 共通基盤は「地味だけど、後でないと気づく」重要な仕事だ。
> エラー形式を後から統一しようとすると、全エンドポイントを修正する羽目になる。
> 最初に設計しておくことで、後続タスクのコストを大幅に下げられる。

**次回**: Supabase を使った Wanna Be・Goals・Habits の CRUD API 実装編

