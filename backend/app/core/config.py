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

    # 【Google OAuth (Phase 7.3 / Calendar 連携)】🟡
    # Google Cloud Console で Web application 用の OAuth クライアントを作成し、
    # 認可された redirect URI に GOOGLE_REDIRECT_URI を登録する。
    # https://console.cloud.google.com/apis/credentials
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/integrations/google/oauth/callback"
    # OAuth 完了後にユーザーを戻すフロントエンド URL
    GOOGLE_OAUTH_FE_RETURN_URL: str = "http://localhost:5175/calendar"

    # 【Google OAuth トークン暗号化キー (Fernet)】🟠
    # google_oauth_tokens テーブルの access_token / refresh_token を対称暗号化するための鍵。
    # 空のままだと平文保存（dev では許容、本番デプロイ前に必ず設定）。
    # 生成: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    OAUTH_TOKEN_ENC_KEY: str = ""

    # 【CORS設定】: フロントエンドURLのホワイトリスト 🔵
    FRONTEND_URL: str = "http://localhost:5173,http://localhost:5174,http://localhost:5175"

    # 【Journal投稿後の旧バックグラウンドAI抽出】
    # v3 は Flow の Coach action Proposal に一本化するためデフォルトOFF。
    # ロールバックが必要な場合だけ .env で true にする。
    JOURNAL_BACKGROUND_MEMORY_EXTRACTION_ENABLED: bool = False
    JOURNAL_BACKGROUND_SUGGESTION_EXTRACTION_ENABLED: bool = False

    model_config = {
        # 【環境変数ファイル】: .env ファイルから設定を読み込む
        "env_file": ".env",
        # 【追加フィールド】: 未定義の環境変数を無視する
        "extra": "ignore",
    }


# 【シングルトン】: アプリ全体で共有する設定インスタンス 🔵
settings = Settings()
