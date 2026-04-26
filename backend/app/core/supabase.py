"""
Supabase クライアント初期化モジュール
TASK-0005: FastAPI共通基盤実装

【設計方針】:
- service_role キーで RLS をバイパスしてバックエンドのビジネスロジックを実行
- シングルトンパターン: アプリ起動時に1回だけ初期化
- anon キーは使用しない（バックエンドは常に service_role で操作）

🔵 信頼性レベル: architecture.md Supabase 設計より
"""
import logging
from typing import Optional

from supabase import Client, create_client

from app.core.config import settings

logger = logging.getLogger(__name__)

# 【グローバルクライアント】: アプリ全体で共有するSupabaseクライアントインスタンス
_supabase_client: Optional[Client] = None


def get_supabase() -> Client:
    """
    【Supabaseクライアント取得】: 初期化済みのクライアントを返す
    【エラー処理】: 未初期化の場合は RuntimeError を発生させる
    🔵 信頼性レベル: architecture.md より
    """
    global _supabase_client
    if _supabase_client is None:
        raise RuntimeError(
            "Supabaseクライアントが初期化されていません。"
            "アプリケーション起動時に init_supabase() を呼び出してください。"
        )
    return _supabase_client


def init_supabase() -> Client:
    """
    【Supabaseクライアント初期化】: FastAPI lifespan で呼び出す
    【service_role使用】: バックエンドは RLS をバイパスして操作
    【シングルトン】: 既に初期化済みの場合は既存インスタンスを返す
    🔵 信頼性レベル: architecture.md Supabase 設計より
    """
    global _supabase_client

    if _supabase_client is not None:
        return _supabase_client

    if not settings.SUPABASE_URL:
        logger.warning("SUPABASE_URL が設定されていません。Supabaseクライアントの初期化をスキップします。")
        return None  # type: ignore[return-value]

    if not settings.SUPABASE_SERVICE_ROLE_KEY:
        logger.warning(
            "SUPABASE_SERVICE_ROLE_KEY が設定されていません。Supabaseクライアントの初期化をスキップします。"
        )
        return None  # type: ignore[return-value]

    try:
        _supabase_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
        )
        logger.info("Supabaseクライアントを初期化しました: %s", settings.SUPABASE_URL)
        return _supabase_client
    except Exception as e:
        logger.error("Supabaseクライアントの初期化に失敗しました: %s", str(e))
        raise


def close_supabase() -> None:
    """
    【Supabaseクライアント終了】: FastAPI lifespan のシャットダウン時に呼び出す
    🟡 信頼性レベル: supabase-py は自動的に接続を管理するため、明示的なクローズは省略可能
    """
    global _supabase_client
    _supabase_client = None
    logger.info("Supabaseクライアントを終了しました。")
