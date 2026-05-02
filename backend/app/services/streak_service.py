"""
ストリーク計算サービス
TASK-0008: 習慣ログ・ストリーク計算・バッジ付与API実装

【設計方針】:
- supabase クライアントを引数で受け取り、テストしやすい設計
- log_date はユーザータイムゾーン換算済みの date 型
- 連続達成日数を過去に遡って計算し、habits テーブルを更新する
- metric_type が 'binary' 以外の量・時刻系習慣にも対応する。
  既存の calling site と互換性を保つため、calculate_streak のシグネチャは維持し、
  habit_meta を渡された場合のみ述語判定パスを使う。

🔵 信頼性レベル: REQ-501/502/503・EDGE-102 より
"""
from datetime import date, timedelta
from typing import Optional


def is_achieved(habit: dict, log: dict) -> bool:
    """
    【達成判定述語】: habit の metric_type に応じて、log が達成条件を満たすか判定する。

    Args:
        habit: habits 行（または同等の dict）。metric_type / target_value / target_value_max /
               target_time を読む。
        log:   habit_logs 行（または同等の dict）。completed / numeric_value / time_value を読む。

    Returns:
        bool: 達成していれば True。
    """
    metric_type = habit.get("metric_type") or "binary"

    if metric_type == "binary":
        return bool(log.get("completed"))

    if metric_type in ("numeric_min", "duration"):
        v = log.get("numeric_value")
        t = habit.get("target_value")
        if v is None or t is None:
            return False
        return float(v) >= float(t)

    if metric_type == "numeric_max":
        v = log.get("numeric_value")
        t = habit.get("target_value")
        if v is None or t is None:
            return False
        return float(v) <= float(t)

    if metric_type == "range":
        v = log.get("numeric_value")
        lo = habit.get("target_value")
        hi = habit.get("target_value_max")
        if v is None or lo is None or hi is None:
            return False
        return float(lo) <= float(v) <= float(hi)

    if metric_type == "time_before":
        # PostgreSQL TIME は "HH:MM:SS" 文字列で返るため、文字列比較で前後判定できる。
        # 入力が "HH:MM" の場合に備えて長さを揃える。
        t_log = _normalize_time(log.get("time_value"))
        t_target = _normalize_time(habit.get("target_time"))
        if t_log is None or t_target is None:
            return False
        return t_log <= t_target

    if metric_type == "time_after":
        t_log = _normalize_time(log.get("time_value"))
        t_target = _normalize_time(habit.get("target_time"))
        if t_log is None or t_target is None:
            return False
        return t_log >= t_target

    return False


def _normalize_time(value) -> Optional[str]:
    """HH:MM / HH:MM:SS / time オブジェクトを "HH:MM:SS" 文字列に正規化する。"""
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    s = str(value)
    if len(s) == 5:  # HH:MM
        return f"{s}:00"
    return s


def calculate_streak(
    supabase,
    habit_id: str,
    user_id: str,
    log_date: date,
    *,
    habit_meta: Optional[dict] = None,
) -> int:
    """
    【ストリーク計算】: log_date から1日ずつ遡り、連続達成日数を返す
    【タイムゾーン】: log_date はユーザータイムゾーン換算済み（呼び出し元責任）
    【アルゴリズム】:
      - habit_meta が None または metric_type='binary' の場合：
          completed=true のログ日付セットから連続日数をカウント（既存挙動）
      - それ以外の metric_type の場合：
          全ログを取得し、is_achieved 述語で達成日セットを作って連続日数をカウント

    Args:
        supabase: Supabase クライアント
        habit_id: 習慣ID
        user_id: ユーザーID
        log_date: チェック日（ユーザータイムゾーンでの日付）
        habit_meta: habits 行。metric_type が 'binary' 以外の場合に必要。
                    None の場合は binary 扱い（後方互換）。

    Returns:
        int: 現在の連続達成日数
    """
    metric_type = (habit_meta or {}).get("metric_type") or "binary"

    if metric_type == "binary":
        # 【既存パス】: completed=true フィルタで効率的に取得
        result = (
            supabase.table("habit_logs")
            .select("log_date")
            .eq("habit_id", habit_id)
            .eq("user_id", user_id)
            .eq("completed", True)
            .execute()
        )
        rows = result.data or []
        completed_dates = {row["log_date"] for row in rows}
    else:
        # 【述語パス】: 全ログを取って is_achieved で判定
        result = (
            supabase.table("habit_logs")
            .select("log_date,completed,numeric_value,time_value")
            .eq("habit_id", habit_id)
            .eq("user_id", user_id)
            .execute()
        )
        rows = result.data or []
        completed_dates = {row["log_date"] for row in rows if is_achieved(habit_meta, row)}

    if not completed_dates:
        return 0

    streak = 0
    current = log_date
    while str(current) in completed_dates:
        streak += 1
        current -= timedelta(days=1)

    return streak


def update_streak(supabase, habit_id: str, streak: int, user_id: str | None = None) -> None:
    """
    【ストリーク更新】: habits テーブルの current_streak / longest_streak を更新する
    【longest_streak】: current_streak が longest_streak を超えた場合のみ更新（REQ-502）

    Args:
        supabase: Supabase クライアント
        habit_id: 習慣ID
        streak: 新しい連続達成日数
        user_id: 指定された場合は所有者条件として追加する
    """
    # 【現在値取得】: longest_streak との比較のため先に取得
    query = (
        supabase.table("habits")
        .select("longest_streak")
        .eq("id", habit_id)
    )
    if user_id is not None:
        query = query.eq("user_id", user_id)
    result = query.single().execute()

    update_data: dict = {"current_streak": streak}

    if result.data:
        longest = result.data.get("longest_streak", 0) or 0
        if streak > longest:
            update_data["longest_streak"] = streak

    update_query = supabase.table("habits").update(update_data).eq("id", habit_id)
    if user_id is not None:
        update_query = update_query.eq("user_id", user_id)
    update_query.execute()
