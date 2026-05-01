"""
APIルーター統合モジュール
TASK-0005/0006: FastAPI共通基盤実装 / Wanna Be・長期目標・ユーザープロフィールAPI

【設計方針】:
- すべての機能ルーターをここで集約し、main.py から一括登録
- /api/v1 プレフィックスはこのモジュールで管理

🔵 信頼性レベル: api-endpoints.md ルーター設計より
"""
from fastapi import APIRouter

from app.api.routes import ai_coach, daily_logs, goals, habit_suggestions, habits, integrations, journal, kpis, mandala, me, monthly_targets, notes, notifications, ops_tasks, primary_target, todo_definitions, user_context, users, voice_input, wanna_be

# 【統合ルーター】: /api/v1 プレフィックス付きで全ルーターをまとめる 🔵
# 【プレフィックス設計】: api-endpoints.md ベースURL は /api（バージョン番号なし）
# TASK-0026: /api/v1 → /api に修正
api_router = APIRouter(prefix="/api")

# 【認証関連ルーター】: /api/v1/me エンドポイント
api_router.include_router(me.router, tags=["auth"])

# 【ユーザープロフィールルーター】: /api/v1/users/me エンドポイント
api_router.include_router(users.router, tags=["users"])

# 【Wanna Be ルーター】: /api/v1/wanna-be エンドポイント
api_router.include_router(wanna_be.router, tags=["wanna-be"])

# 【長期目標ルーター】: /api/v1/goals エンドポイント
api_router.include_router(goals.router, tags=["goals"])

# 【通知設定ルーター】: /api/v1/notifications/settings エンドポイント
api_router.include_router(notifications.router, tags=["notifications"])

# 【習慣ルーター】: /api/habits エンドポイント
api_router.include_router(habits.router, tags=["habits"])

# 【音声入力ルーター】: /api/voice-input エンドポイント
api_router.include_router(voice_input.router, tags=["voice-input"])

# 【AIコーチルーター】: /api/ai/weekly-review/stream エンドポイント
api_router.include_router(ai_coach.router, tags=["ai-coach"])

# 【KPI ルーター】: /api/kpis エンドポイント（TASK-0031）
api_router.include_router(kpis.router, tags=["kpis"])

# 【マンダラチャートルーター】: /api/mandala エンドポイント（Sprint 1）
api_router.include_router(mandala.router, tags=["mandala"])

# 【ジャーナルルーター】: /api/journals エンドポイント
api_router.include_router(journal.router, tags=["journals"])

# 【Todo定義ルーター】: /api/todo-definitions エンドポイント
api_router.include_router(todo_definitions.router, tags=["todo-definitions"])

# 【日次ログルーター】: /api/daily-logs エンドポイント
api_router.include_router(daily_logs.router, tags=["daily-logs"])

# 【オペレーションタスクルーター】: /api/ops-tasks エンドポイント
api_router.include_router(ops_tasks.router, tags=["ops-tasks"])

# 【Primary Target ルーター】: /api/primary-target エンドポイント
api_router.include_router(primary_target.router, tags=["primary-target"])

# 【月次目標ルーター】: /api/monthly-targets エンドポイント
api_router.include_router(monthly_targets.router, tags=["monthly-targets"])

# 【ユーザーコンテキストルーター】: /api/user-context エンドポイント
api_router.include_router(user_context.router, tags=["user-context"])

# 【外部連携ルーター】: /api/integrations エンドポイント（iOS Shortcuts）
api_router.include_router(integrations.router, tags=["integrations"])

# 【ノートルーター】: /api/notes エンドポイント
api_router.include_router(notes.router, tags=["notes"])

# 【習慣候補ルーター】: /api/habit-suggestions エンドポイント
api_router.include_router(habit_suggestions.router, tags=["habit-suggestions"])
