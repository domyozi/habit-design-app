# 認証フロー実装 Greenフェーズ記録

**タスクID**: TASK-0004
**機能名**: auth-flow
**作成日**: 2026-04-13
**フェーズ**: Green（テストを通す最小実装）

---

## 実装したファイル

| ファイル | 内容 |
|---------|------|
| `backend/app/core/config.py` | Settings クラス（pydantic-settings） |
| `backend/app/core/security.py` | verify_token()・get_current_user() |
| `backend/app/api/routes/me.py` | GET /api/v1/me エンドポイント |
| `backend/app/main.py` | ルーターマウント追加 |

---

## 実装方針と判断理由

### TC-008 対応（expクレーム欠落の拒否）

python-jose 3.3.0 で `options={"require": ["exp"]}` を渡しても `exp` なしトークンをエラーにしない挙動を確認。
そのため `jwt.decode` 後に `"exp" not in payload` を手動でチェックする方針に変更。

---

## テスト実行結果

```
9 passed, 6 warnings in 0.02s
```

### 通過したテストケース

| テストID | 結果 |
|---------|------|
| TC-001: valid_token_returns_user_id | PASSED ✅ |
| TC-003: invalid_signature_returns_none | PASSED ✅ |
| TC-004: expired_token_returns_none | PASSED ✅ |
| TC-007: token_without_sub_returns_none | PASSED ✅ |
| TC-008: token_without_exp_returns_none | PASSED ✅ |
| TC-002: valid_bearer_token_returns_200 | PASSED ✅ |
| TC-005: no_auth_header_returns_403 | PASSED ✅ |
| TC-006: invalid_bearer_token_returns_401 | PASSED ✅ |
| TC-004ext: expired_bearer_token_returns_401 | PASSED ✅ |

---

## 課題・改善点（Refactorフェーズで対応）

1. **`backend/app/main.py`のインポート位置**: ルーターのインポートをファイル末尾に書いた（`# noqa: E402`対応）→ ファイル冒頭に移動する
2. **フロントエンド実装**: authStore（Zustand）の実装が未着手
3. **警告**: python-jose の `datetime.utcnow()` DeprecationWarning → jose ライブラリ依存なので修正不要
