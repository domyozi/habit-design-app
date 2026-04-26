"""
カスタム例外クラスとFastAPIエラーハンドラー
TASK-0005: FastAPI共通基盤実装

【設計方針】:
- 全エラーを ErrorResponse 形式で統一 (api-endpoints.md)
- ValidationError は日本語メッセージで返す（UX向上）
- 予期せぬ 500 エラーも ErrorResponse 形式に揃える

🔵 信頼性レベル: api-endpoints.md エラーレスポンス共通フォーマット より
"""
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.models.schemas import ErrorDetail, ErrorResponse

logger = logging.getLogger(__name__)


# =============================================
# カスタム例外クラス
# =============================================


class AppError(Exception):
    """
    【アプリケーション基底例外】: すべてのビジネスロジック例外の親クラス
    🔵 信頼性レベル: api-endpoints.md エラーコード設計より
    """

    def __init__(self, code: str, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class NotFoundError(AppError):
    """【リソース未存在エラー】: 404 を返す 🔵"""

    def __init__(self, resource: str):
        super().__init__(
            code="NOT_FOUND",
            message=f"{resource} が見つかりません",
            status_code=404,
        )


class ForbiddenError(AppError):
    """【権限エラー】: 他ユーザーのリソースへのアクセス 🔵"""

    def __init__(self):
        super().__init__(
            code="FORBIDDEN",
            message="このリソースへのアクセス権限がありません",
            status_code=403,
        )


class ConflictError(AppError):
    """【競合エラー】: データの重複や状態競合 🔵"""

    def __init__(self, message: str = "リソースが競合しています"):
        super().__init__(
            code="CONFLICT",
            message=message,
            status_code=409,
        )


# =============================================
# Pydantic エラー種別 → 日本語メッセージ変換
# =============================================

# 【Pydanticエラー種別の日本語マッピング】: 英語文言が露出しないよう変換
# TASK-0026: "Field required" 等の英語文言を完全に日本語化
# 🔵 信頼性レベル: Pydantic v2 エラー種別ドキュメントより
_PYDANTIC_ERROR_MSG_MAP: dict[str, str] = {
    "missing": "この項目は必須です",
    "string_too_short": "文字数が短すぎます",
    "string_too_long": "文字数が長すぎます",
    "value_error": "入力値が不正です",
    "type_error": "型が不正です",
    "int_parsing": "整数値を入力してください",
    "float_parsing": "数値を入力してください",
    "bool_parsing": "真偽値（true/false）を入力してください",
    "greater_than_equal": "値が小さすぎます",
    "less_than_equal": "値が大きすぎます",
    "greater_than": "値が小さすぎます",
    "less_than": "値が大きすぎます",
    "too_short": "リストの要素が少なすぎます",
    "too_long": "リストの要素が多すぎます",
    "string_pattern_mismatch": "入力形式が正しくありません",
    "json_invalid": "JSON形式が不正です",
    "url_parsing": "URLの形式が正しくありません",
    "enum": "許可されていない値です",
}


def _translate_pydantic_error(error: dict, loc: str) -> str:
    """
    【Pydanticエラー日本語変換】: エラー種別（type）から日本語メッセージを生成
    【英語文言排除】: "Field required" 等の Pydantic デフォルト英語メッセージを使わない
    🔵 信頼性レベル: TASK-0026 422日本語化要件より
    """
    error_type = error.get("type", "")
    # タイプの先頭部分でマッチング（"string_too_short" など）
    japanese_msg = None
    for key, msg in _PYDANTIC_ERROR_MSG_MAP.items():
        if error_type == key or error_type.startswith(key):
            japanese_msg = msg
            break

    if japanese_msg is None:
        japanese_msg = "入力値が不正です"

    if loc:
        return f"{loc}: {japanese_msg}"
    return japanese_msg


# =============================================
# エラーハンドラー登録関数
# =============================================


def register_exception_handlers(app: FastAPI) -> None:
    """
    【エラーハンドラー一括登録】: FastAPI アプリにエラーハンドラーを登録する
    【設計方針】: 全エラーを ErrorResponse 形式で統一して返す
    🔵 信頼性レベル: api-endpoints.md エラーレスポンス共通フォーマット より
    """

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        """
        【バリデーションエラー処理】: 422 Unprocessable Entity
        【日本語化】: Pydantic エラー種別を日本語メッセージに完全変換
        TASK-0026: "Field required" 等の英語文言が露出しないよう改善
        🔵 信頼性レベル: api-endpoints.md より
        """
        errors = exc.errors()
        if errors:
            first_error = errors[0]
            loc_parts = [str(l) for l in first_error.get("loc", []) if l != "body"]
            loc = " → ".join(loc_parts) if loc_parts else ""
            detail_message = _translate_pydantic_error(first_error, loc)
        else:
            detail_message = "入力値が不正です"

        return JSONResponse(
            status_code=422,
            content=ErrorResponse(
                error=ErrorDetail(
                    code="VALIDATION_ERROR",
                    message=detail_message,
                )
            ).model_dump(),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        """
        【HTTPエラー処理】: 401/403/404 等の HTTPException を ErrorResponse 形式に変換
        🔵 信頼性レベル: api-endpoints.md エラーレスポンス共通フォーマット より
        """
        # HTTPステータスコードに対応するエラーコードを決定
        code_map = {
            400: "BAD_REQUEST",
            401: "UNAUTHORIZED",
            403: "FORBIDDEN",
            404: "NOT_FOUND",
            405: "METHOD_NOT_ALLOWED",
            409: "CONFLICT",
            422: "VALIDATION_ERROR",
            500: "INTERNAL_SERVER_ERROR",
        }
        code = code_map.get(exc.status_code, "HTTP_ERROR")

        return JSONResponse(
            status_code=exc.status_code,
            content=ErrorResponse(
                error=ErrorDetail(
                    code=code,
                    message=str(exc.detail),
                )
            ).model_dump(),
        )

    @app.exception_handler(AppError)
    async def app_error_handler(
        request: Request, exc: AppError
    ) -> JSONResponse:
        """
        【アプリエラー処理】: AppError サブクラスを ErrorResponse 形式に変換
        🔵 信頼性レベル: api-endpoints.md エラーレスポンス共通フォーマット より
        """
        return JSONResponse(
            status_code=exc.status_code,
            content=ErrorResponse(
                error=ErrorDetail(
                    code=exc.code,
                    message=exc.message,
                )
            ).model_dump(),
        )

    @app.exception_handler(Exception)
    async def unexpected_error_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        """
        【予期せぬエラー処理】: 500 Internal Server Error
        【ログ記録】: 詳細エラーはサーバーログに記録し、クライアントには最小限の情報のみ返す
        🔵 信頼性レベル: api-endpoints.md エラーレスポンス共通フォーマット より
        """
        logger.exception("予期せぬエラーが発生しました: %s", str(exc))

        return JSONResponse(
            status_code=500,
            content=ErrorResponse(
                error=ErrorDetail(
                    code="INTERNAL_SERVER_ERROR",
                    message="サーバー内部エラーが発生しました",
                )
            ).model_dump(),
        )
