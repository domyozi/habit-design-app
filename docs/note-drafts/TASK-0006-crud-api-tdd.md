# FastAPI × Supabase の CRUD API を TDD で実装する：モック戦略とバリデーション設計の落とし穴

## この記事でわかること

- Supabase（supabase-py）を使う FastAPI エンドポイントのテスト戦略
- `unittest.mock` で Supabase クライアントをモックする具体的なパターン
- Pydantic バリデーション（422）と アプリロジックエラー（400）を使い分けるべき理由

---

## 背景：「DBがなくてもテストできる」設計を目指す

FastAPI + Supabase 構成でAPIを書くと、毎回実際の DB にアクセスするテストを書くことになる。
しかしユニットテストはDBに依存すべきではない。「DBがなくても動く」テストを作るには、Supabaseクライアントをモックする必要がある。

---

## Supabase クライアントのモック戦略

supabase-py のクエリはメソッドチェーンになっている:

```python
# 実際のコード
result = (
    supabase.table("user_profiles")
    .select("*")
    .eq("id", user_id)
    .single()
    .execute()
)
```

これを `unittest.mock` でモックするには:

```python
from unittest.mock import MagicMock, patch

@patch("app.api.routes.users.get_supabase")
def test_something(mock_get_supabase, client, valid_token):
    mock_sb = MagicMock()
    mock_get_supabase.return_value = mock_sb
    
    # .table().select().eq().single().execute().data に返り値を設定
    mock_sb.table.return_value.select.return_value \
        .eq.return_value.single.return_value.execute.return_value \
        .data = {"id": "uuid", "display_name": "田中 太郎", ...}
```

**ポイント**: `MagicMock()` は存在しないメソッド呼び出しを自動的にモックに変換する。
チェーンの末尾 `.data` に返したい値を設定すれば、任意のDBレスポンスを再現できる。

### パスの指定に注意

`patch("app.api.routes.users.get_supabase")` とルーターファイルのパスを指定する必要がある。
`patch("app.core.supabase.get_supabase")` ではない。

なぜか: Python の `patch` は「呼び出し元のモジュールで参照されている名前」をモックする。
`users.py` でインポートされた `get_supabase` をモックするため、`users.py` のパスを使う。

---

## 落とし穴：Pydantic バリデーション（422）と AppError（400）の使い分け

### 問題

目標は最大3件という仕様（REQ-204）を実装するとき、最初こうした:

```python
class SaveGoalsRequest(BaseModel):
    goals: list[GoalItem] = Field(..., min_length=1, max_length=3)  # ← max_length=3
```

テストで4件送ると...

```
Expected: HTTP 400, error.code == "VALIDATION_ERROR"
Actual:   HTTP 422  (Pydantic のデフォルト)
```

**原因**: Pydantic の `max_length=3` 超過は 422 Unprocessable Entity を返す。
しかし仕様書（api-endpoints.md）は 400 Bad Request + `VALIDATION_ERROR` を要求していた。

### 解決策：スキーマからmax_lengthを外してルーターでチェック

```python
class SaveGoalsRequest(BaseModel):
    goals: list[GoalItem] = Field(..., min_length=1)  # max_length は外す

@router.post("/goals", status_code=201)
async def save_goals(request: SaveGoalsRequest, ...):
    # ルーターで明示的にチェック → AppError(400) を raise
    if len(request.goals) > 3:
        raise AppError(
            code="VALIDATION_ERROR",
            message="目標は最大3件まで設定できます",
            status_code=400,
        )
```

### 使い分けの原則

| エラーの性質 | ステータスコード | 実装方法 |
|---|---|---|
| 型の不一致・フィールド必須 | 422 | Pydantic スキーマ（自動） |
| ビジネスルール違反 | 400 | ルーターで AppError を raise |
| リソース未存在 | 404 | ルーターで NotFoundError を raise |

「文字が長すぎる（型制約）」は 422。「目標が多すぎる（ビジネスルール）」は 400。
この区別を最初から設計しておくとフロントエンドのエラーハンドリングが統一できる。

---

## 204 No Content の正しい返し方

Wanna Be 未登録時は `204 No Content` を返す仕様:

```python
from fastapi.responses import Response

@router.get("/wanna-be")
async def get_wanna_be(user_id: str = Depends(get_current_user)):
    result = supabase.table("wanna_be").select("*").eq(...).single().execute()
    
    if result.data is None:
        return Response(status_code=204)  # ← ボディなし
    
    return APIResponse(success=True, data=WannaBe(**result.data))
```

**注意**: `response_model=APIResponse[WannaBe]` を指定すると、204 の場合でもPydanticがシリアライズしようとしてエラーになる。
`response_model` を外すか、`Union` 型で明示する必要がある。

---

## 目標保存の「上書き保存」処理

`POST /goals` は「AI提案を承認して保存」するエンドポイント。
毎回送られてきた目標で上書きする設計:

```python
# 1. 既存 is_active=true の目標を全て非活性化
supabase.table("goals").update({"is_active": False}).eq("user_id", user_id).execute()

# 2. 新目標を一括 INSERT
new_goals = [
    {"user_id": user_id, "title": goal.title, "display_order": i, "is_active": True, ...}
    for i, goal in enumerate(request.goals)
]
result = supabase.table("goals").insert(new_goals).execute()
```

**トレードオフ**: 2ステップになっているため、1ステップ目が成功して2ステップ目が失敗すると目標が全て消える。
Supabase はトランザクションを RPCで呼ぶか、エラーハンドリングで1ステップ目を巻き戻す必要がある。
今回は最小実装としてこの形にしているが、本番では注意が必要。

---

## TDD で気づいたこと：テストが設計を改善させる

今回の TDD サイクルで Red → Green の間に設計が変わった:

1. **Red 時**: `max_length=3` で 422 を期待していた
2. **仕様を確認**: api-endpoints.md には 400 VALIDATION_ERROR と書いてある
3. **設計変更**: Pydantic バリデーションではなくルーターで制御する方針に変更
4. **Green 時**: AppError(400) で正しく通過

**テストを先に書くことで仕様との齟齬を発見できた**。
実装を先に書いていたら、422 を返す実装を「動いている」と思い込んで終わっていたかもしれない。

---

## アーキテクト視点のまとめ

1. **モックのパス指定**: 「呼び出し元モジュールの名前」を patch する
2. **422 vs 400**: 型制約は Pydantic（422）、ビジネスルールは AppError（400）
3. **204 No Content**: `response_model` をつけないで `Response(status_code=204)` を返す
4. **2ステップ処理**: 非活性化→INSERT は本番ではトランザクション管理が必要

> TDD は「仕様と実装の橋渡し」だ。
> テストを先に書くことで、仕様書を読み直すタイミングが生まれる。
> 実装を先に書くと、仕様を確認せずに「動いている」と思い込みやすい。

**次回**: Claude AI統合・SSEストリーミング実装編（TASK-0010）

