"""
Resendメール送信サービス
TASK-0011: APSchedulerスケジューラー + Resendメール通知実装

【設計方針】:
- Resend APIでメールを送信する
- 送信失敗時はログのみ記録し、アプリは継続動作（REQ-802）
- テスト環境ではモック化してAPIコストを回避

🔵 信頼性レベル: REQ-801・design-interview.md Q4（Resend選定）より
"""
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# 送信元メールアドレス（環境変数から取得）
FROM_EMAIL = os.getenv("FROM_EMAIL", "habit-coach@notifications.habit-app.dev")


async def send_reminder_email(
    to_email: str,
    user_name: Optional[str] = None,
    resend_client=None,
) -> bool:
    """
    【リマインダーメール送信】: 週次レビューリマインダーをResendで送信する
    【失敗時継続】: メール送信失敗はログのみ記録し、Falseを返す（アプリは継続）

    Args:
        to_email: 送信先メールアドレス
        user_name: ユーザー表示名（省略時は汎用メッセージ）
        resend_client: Resendクライアント（テスト用に注入可能）

    Returns:
        bool: 送信成功ならTrue、失敗ならFalse
    """
    try:
        import resend as resend_module

        api_key = os.getenv("RESEND_API_KEY", "")
        if not api_key:
            logger.warning("RESEND_API_KEY が設定されていません。メール送信をスキップします。")
            return False

        if resend_client is None:
            resend_module.api_key = api_key
            client = resend_module
        else:
            client = resend_client

        greeting = f"{user_name}さん" if user_name else "こんにちは"
        html_body = f"""
<html>
<body>
<p>{greeting}、</p>
<p>今週の習慣トラッキングを振り返りましょう！</p>
<p>アプリを開いて、今週の達成状況を確認し、来週の目標を設定しましょう。</p>
<p>継続は力なり。引き続き頑張りましょう！</p>
<br>
<p>Habit Design App より</p>
</body>
</html>
        """.strip()

        result = client.Emails.send({
            "from": FROM_EMAIL,
            "to": [to_email],
            "subject": "今週の習慣を振り返りましょう 📊",
            "html": html_body,
        })

        logger.info("リマインダーメール送信成功: to=%s", to_email)
        return True

    except Exception as e:
        # 【失敗時継続】: エラーログのみ記録し、アプリは継続動作（REQ-802）
        logger.error("リマインダーメール送信失敗: to=%s, error=%s", to_email, str(e))
        return False
