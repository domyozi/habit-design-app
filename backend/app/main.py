"""
FastAPI アプリケーションエントリーポイント
習慣設計アプリのバックエンドAPIサーバー
TASK-0005: FastAPI共通基盤実装

【設計方針】:
- lifespan で Supabase クライアントの初期化・終了を管理
- CORS設定でフロントエンドからのリクエストを許可
- /api/v1 プレフィックスで全APIエンドポイントを管理
- / と /health は認証不要の公開エンドポイント (NFR-102)
- 全エラーを ErrorResponse 形式で統一 (api-endpoints.md)

🔵 信頼性レベル: architecture.md セキュリティ設計・NFR-102 より
"""
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import api_router
from app.core.exceptions import register_exception_handlers
from app.core.supabase import close_supabase, init_supabase
from scheduler.weekly_review import setup_scheduler

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    【ライフスパン管理】: アプリ起動・終了時の処理を定義
    【起動時】: Supabase クライアントを初期化して app.state.supabase に格納
    【終了時】: Supabase クライアントを解放
    🔵 信頼性レベル: FastAPI lifespan パターン / architecture.md より
    TASK-0026: app.state.supabase への格納を追加（TASK-0005仕様差分修正）
    """
    # 【起動処理】: Supabase クライアントを初期化し app.state に保持
    # 各エンドポイントから Request.app.state.supabase でアクセス可能にする
    client = init_supabase()
    app.state.supabase = client

    # 【スケジューラー起動】: APScheduler で週次リマインダーを定期実行（TASK-0011）
    scheduler = setup_scheduler()
    scheduler.start()

    yield

    # 【終了処理】: スケジューラーとSupabaseクライアントを解放
    scheduler.shutdown(wait=False)
    close_supabase()
    app.state.supabase = None


app = FastAPI(
    title="Habit Design App API",
    description="未来の自分から逆算して習慣を設計・トラッキングするアプリのAPI",
    version="0.1.0",
    lifespan=lifespan,
)

# 【エラーハンドラー登録】: 全エラーを ErrorResponse 形式に統一 🔵
register_exception_handlers(app)

# 【CORS設定】: フロントエンドからのクロスオリジンリクエストを許可 🔵
# NFR-101: FRONTEND_URL 以外のオリジンは拒否
# 複数オリジン対応: カンマ区切りで複数URL指定可能
# 例: FRONTEND_URL=https://habit.vercel.app,https://habit-preview.vercel.app
_frontend_urls = os.getenv("FRONTEND_URL", "http://localhost:5173,http://localhost:5174")
allow_origins = [url.strip() for url in _frontend_urls.split(",") if url.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 【APIルーター登録】: /api/v1 プレフィックスで全エンドポイントをマウント 🔵
app.include_router(api_router)


@app.get("/")
async def root():
    """
    【公開エンドポイント】: API稼働確認
    【認証不要】: NFR-102 に従い、/ は認証なしでアクセス可能
    🔵 信頼性レベル: NFR-102 より
    """
    return {
        "message": "Habit Design App API is running",
        "version": "0.1.0",
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    """
    【公開エンドポイント】: ヘルスチェック
    【認証不要】: NFR-102 に従い、/health は認証なしでアクセス可能
    【用途】: デプロイ環境のヘルスチェックやモニタリングで使用
    🔵 信頼性レベル: NFR-102 より
    """
    return {"status": "ok"}
