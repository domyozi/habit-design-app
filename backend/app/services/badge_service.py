"""
バッジ付与サービス
TASK-0008: 習慣ログ・ストリーク計算・バッジ付与API実装

【設計方針】:
- supabase クライアントを引数で受け取り、テストしやすい設計
- ストリーク条件を満たす最上位のバッジを1件付与する（未取得のもの）
- DB の UNIQUE 制約（user_id, badge_id, habit_id）で重複付与防止

🔵 信頼性レベル: REQ-901・api-endpoints.md より
"""
from typing import Optional


def check_and_award_badges(
    supabase,
    user_id: str,
    habit_id: str,
    streak: int,
) -> Optional[dict]:
    """
    【バッジ付与チェック】: ストリークに応じたバッジを判定し、未取得の場合に付与する
    【重複防止】: DB の UNIQUE 制約 + アプリ側での事前チェックで二重付与を防ぐ

    Args:
        supabase: Supabase クライアント
        user_id: ユーザーID
        habit_id: 習慣ID（どの習慣でバッジを獲得したか記録）
        streak: 現在の連続達成日数

    Returns:
        dict: 付与されたバッジ情報（badge_definitions を含む）、なければ None
    """
    if streak <= 0:
        return None

    # 【バッジ定義取得】: condition_type=streak かつ条件値<=streak のものを取得
    # condition_value 降順で取得し、最も難しいバッジを優先する
    badges_result = (
        supabase.table("badge_definitions")
        .select("*")
        .eq("condition_type", "streak")
        .lte("condition_value", streak)
        .order("condition_value", desc=True)
        .execute()
    )

    eligible_badges = badges_result.data or []
    if not eligible_badges:
        return None

    # 【未取得バッジを検索・付与】: 最上位から順にチェックして未取得の最初を付与
    for badge in eligible_badges:
        existing = (
            supabase.table("user_badges")
            .select("id")
            .eq("user_id", user_id)
            .eq("badge_id", badge["id"])
            .eq("habit_id", habit_id)
            .execute()
        )

        if not (existing.data and len(existing.data) > 0):
            # 【バッジ付与】: user_badges に INSERT
            insert_result = supabase.table("user_badges").insert({
                "user_id": user_id,
                "badge_id": badge["id"],
                "habit_id": habit_id,
            }).execute()

            if insert_result.data and len(insert_result.data) > 0:
                awarded = dict(insert_result.data[0])
                awarded["badge"] = badge
                return awarded

    return None
