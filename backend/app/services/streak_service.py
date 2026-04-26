"""
ストリーク計算サービス
TASK-0008: 習慣ログ・ストリーク計算・バッジ付与API実装

【設計方針】:
- supabase クライアントを引数で受け取り、テストしやすい設計
- log_date はユーザータイムゾーン換算済みの date 型
- 連続達成日数を過去に遡って計算し、habits テーブルを更新する

🔵 信頼性レベル: REQ-501/502/503・EDGE-102 より
"""
from datetime import date, timedelta


def calculate_streak(supabase, habit_id: str, user_id: str, log_date: date) -> int:
    """
    【ストリーク計算】: log_date から1日ずつ遡り、連続達成日数を返す
    【タイムゾーン】: log_date はユーザータイムゾーン換算済み（呼び出し元責任）
    【アルゴリズム】: completed=true のログ日付セットを構築し、途切れた日でカウント停止

    Args:
        supabase: Supabase クライアント
        habit_id: 習慣ID
        user_id: ユーザーID
        log_date: チェック日（ユーザータイムゾーンでの日付）

    Returns:
        int: 現在の連続達成日数
    """
    # 【ログ取得】: completed=true のログ日付を全件取得
    result = (
        supabase.table("habit_logs")
        .select("log_date")
        .eq("habit_id", habit_id)
        .eq("user_id", user_id)
        .eq("completed", True)
        .execute()
    )

    logs = result.data or []
    if not logs:
        return 0

    # 【日付セット構築】: 文字列で管理（YYYY-MM-DD）
    completed_dates = {row["log_date"] for row in logs}

    # 【ストリーク計算】: log_date から1日ずつ遡ってカウント
    streak = 0
    current = log_date
    while str(current) in completed_dates:
        streak += 1
        current -= timedelta(days=1)

    return streak


def update_streak(supabase, habit_id: str, streak: int) -> None:
    """
    【ストリーク更新】: habits テーブルの current_streak / longest_streak を更新する
    【longest_streak】: current_streak が longest_streak を超えた場合のみ更新（REQ-502）

    Args:
        supabase: Supabase クライアント
        habit_id: 習慣ID
        streak: 新しい連続達成日数
    """
    # 【現在値取得】: longest_streak との比較のため先に取得
    result = (
        supabase.table("habits")
        .select("longest_streak")
        .eq("id", habit_id)
        .single()
        .execute()
    )

    update_data: dict = {"current_streak": streak}

    if result.data:
        longest = result.data.get("longest_streak", 0) or 0
        if streak > longest:
            update_data["longest_streak"] = streak

    supabase.table("habits").update(update_data).eq("id", habit_id).execute()
