"""
アプリケーション設定
pydantic-settings を使用して .env から環境変数を読み込む

【実装方針】: Pydantic v2 に対応した BaseSettings を使用
🔵 信頼性レベル: note.md 開発ルール・TASK-0004.md より
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """
    【機能概要】: アプリケーション設定クラス
    【実装方針】: pydantic-settings の BaseSettings を使用して .env から自動読み込み
    【テスト対応】: テスト時は os.environ["SUPABASE_JWT_SECRET"] で上書き可能
    🔵 信頼性レベル: note.md 開発ルール「pydantic-settings の BaseSettings を使用」より
    """

    # 【Supabase設定】: JWT検証に必要なシークレット 🔵
    SUPABASE_JWT_SECRET: str = ""

    # 【Supabase接続設定】: APIクライアント用 🔵
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # 【外部API設定】: AI・メール通知用 🟡
    ANTHROPIC_API_KEY: str = ""
    RESEND_API_KEY: str = ""

    # 【CORS設定】: フロントエンドURLのホワイトリスト 🔵
    FRONTEND_URL: str = "http://localhost:5173,http://localhost:5174"

    model_config = {
        # 【環境変数ファイル】: .env ファイルから設定を読み込む
        "env_file": ".env",
        # 【追加フィールド】: 未定義の環境変数を無視する
        "extra": "ignore",
    }


# 【シングルトン】: アプリ全体で共有する設定インスタンス 🔵
settings = Settings()
