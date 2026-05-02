"""
量・時刻系 Habit (metric_type 拡張) のテスト

カバー範囲:
- streak_service.is_achieved : 各 metric_type の達成判定
- streak_service.calculate_streak : 量的タイプでのストリーク計算
- PATCH /api/habits/{id}/log : numeric_value / time_value 経由の達成と未達成
"""
from datetime import date, timedelta
from unittest.mock import MagicMock, patch


TEST_USER_ID = "00000000-0000-0000-0000-000000000001"
TEST_HABIT_ID = "00000000-0000-0000-0000-000000000021"
TEST_LOG_ID = "00000000-0000-0000-0000-000000000041"
TODAY = str(date.today())


def _make_metric_habit(metric_type, **overrides):
    base = {
        "id": TEST_HABIT_ID,
        "user_id": TEST_USER_ID,
        "goal_id": None,
        "title": "読書",
        "description": None,
        "frequency": "daily",
        "scheduled_time": None,
        "display_order": 0,
        "current_streak": 0,
        "longest_streak": 0,
        "is_active": True,
        "wanna_be_connection_text": None,
        "metric_type": metric_type,
        "target_value": None,
        "target_value_max": None,
        "target_time": None,
        "unit": None,
        "aggregation": "exists",
        "created_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
    }
    base.update(overrides)
    return base


def _make_metric_log(**overrides):
    base = {
        "id": TEST_LOG_ID,
        "habit_id": TEST_HABIT_ID,
        "user_id": TEST_USER_ID,
        "log_date": TODAY,
        "completed": False,
        "completed_at": None,
        "input_method": "manual",
        "numeric_value": None,
        "time_value": None,
        "created_at": "2026-04-14T07:30:00+00:00",
    }
    base.update(overrides)
    return base


# ==================================================
# is_achieved 述語のユニットテスト
# ==================================================

class TestIsAchieved:
    def test_binary_completed_true(self):
        from app.services.streak_service import is_achieved
        habit = _make_metric_habit("binary")
        assert is_achieved(habit, {"completed": True}) is True

    def test_binary_completed_false(self):
        from app.services.streak_service import is_achieved
        habit = _make_metric_habit("binary")
        assert is_achieved(habit, {"completed": False}) is False

    def test_numeric_min_meets_threshold(self):
        from app.services.streak_service import is_achieved
        habit = _make_metric_habit("numeric_min", target_value=15)
        assert is_achieved(habit, {"numeric_value": 20}) is True

    def test_numeric_min_below_threshold(self):
        from app.services.streak_service import is_achieved
        habit = _make_metric_habit("numeric_min", target_value=15)
        assert is_achieved(habit, {"numeric_value": 10}) is False

    def test_numeric_min_missing_value(self):
        from app.services.streak_service import is_achieved
        habit = _make_metric_habit("numeric_min", target_value=15)
        assert is_achieved(habit, {}) is False

    def test_duration_alias_of_numeric_min(self):
        from app.services.streak_service import is_achieved
        habit = _make_metric_habit("duration", target_value=10, unit="分")
        assert is_achieved(habit, {"numeric_value": 25}) is True
        assert is_achieved(habit, {"numeric_value": 5}) is False

    def test_numeric_max_within_limit(self):
        from app.services.streak_service import is_achieved
        habit = _make_metric_habit("numeric_max", target_value=2)
        assert is_achieved(habit, {"numeric_value": 1}) is True
        assert is_achieved(habit, {"numeric_value": 3}) is False

    def test_range(self):
        from app.services.streak_service import is_achieved
        habit = _make_metric_habit("range", target_value=60, target_value_max=65)
        assert is_achieved(habit, {"numeric_value": 62}) is True
        assert is_achieved(habit, {"numeric_value": 60}) is True
        assert is_achieved(habit, {"numeric_value": 65}) is True
        assert is_achieved(habit, {"numeric_value": 59}) is False
        assert is_achieved(habit, {"numeric_value": 66}) is False

    def test_time_before_string(self):
        from app.services.streak_service import is_achieved
        habit = _make_metric_habit("time_before", target_time="07:00:00")
        assert is_achieved(habit, {"time_value": "06:45:00"}) is True
        assert is_achieved(habit, {"time_value": "07:00:00"}) is True
        assert is_achieved(habit, {"time_value": "07:15:00"}) is False

    def test_time_before_with_short_format(self):
        # "HH:MM" を渡されても比較できる
        from app.services.streak_service import is_achieved
        habit = _make_metric_habit("time_before", target_time="07:00")
        assert is_achieved(habit, {"time_value": "06:45"}) is True
        assert is_achieved(habit, {"time_value": "07:30"}) is False

    def test_time_after(self):
        from app.services.streak_service import is_achieved
        habit = _make_metric_habit("time_after", target_time="09:30:00")
        assert is_achieved(habit, {"time_value": "10:00:00"}) is True
        assert is_achieved(habit, {"time_value": "09:00:00"}) is False


# ==================================================
# calculate_streak の metric_type 分岐テスト
# ==================================================

class TestCalculateStreakWithMetric:
    def test_duration_streak_5_days(self):
        """duration habit で 5 日連続達成のストリーク計算"""
        from app.services.streak_service import calculate_streak

        today = date.today()
        habit = _make_metric_habit("duration", target_value=15)
        mock_sb = MagicMock()
        rows = [
            {
                "log_date": str(today - timedelta(days=i)),
                "completed": False,
                "numeric_value": 20,  # 全て閾値超え
                "time_value": None,
            }
            for i in range(5)
        ]
        mock_sb.table.return_value.select.return_value \
            .eq.return_value.eq.return_value \
            .execute.return_value.data = rows

        streak = calculate_streak(
            mock_sb, TEST_HABIT_ID, TEST_USER_ID, today, habit_meta=habit
        )
        assert streak == 5

    def test_duration_streak_breaks_on_below_target(self):
        """duration habit で閾値を下回る日があれば streak が途切れる"""
        from app.services.streak_service import calculate_streak

        today = date.today()
        habit = _make_metric_habit("numeric_min", target_value=15)
        mock_sb = MagicMock()
        rows = [
            {"log_date": str(today), "completed": False, "numeric_value": 30, "time_value": None},
            {"log_date": str(today - timedelta(days=1)), "completed": False, "numeric_value": 20, "time_value": None},
            {"log_date": str(today - timedelta(days=2)), "completed": False, "numeric_value": 5, "time_value": None},  # 閾値未満
            {"log_date": str(today - timedelta(days=3)), "completed": False, "numeric_value": 25, "time_value": None},
        ]
        mock_sb.table.return_value.select.return_value \
            .eq.return_value.eq.return_value \
            .execute.return_value.data = rows

        streak = calculate_streak(
            mock_sb, TEST_HABIT_ID, TEST_USER_ID, today, habit_meta=habit
        )
        assert streak == 2  # 今日と昨日のみ

    def test_time_before_streak(self):
        """time_before habit で閾値時刻を満たす日が連続するとストリークが伸びる"""
        from app.services.streak_service import calculate_streak

        today = date.today()
        habit = _make_metric_habit("time_before", target_time="07:00:00")
        mock_sb = MagicMock()
        rows = [
            {"log_date": str(today), "completed": False, "numeric_value": None, "time_value": "06:30:00"},
            {"log_date": str(today - timedelta(days=1)), "completed": False, "numeric_value": None, "time_value": "06:55:00"},
            {"log_date": str(today - timedelta(days=2)), "completed": False, "numeric_value": None, "time_value": "07:30:00"},  # 遅刻
        ]
        mock_sb.table.return_value.select.return_value \
            .eq.return_value.eq.return_value \
            .execute.return_value.data = rows

        streak = calculate_streak(
            mock_sb, TEST_HABIT_ID, TEST_USER_ID, today, habit_meta=habit
        )
        assert streak == 2


# ==================================================
# PATCH /api/habits/{id}/log の量的入力 happy path
# ==================================================

class TestUpdateHabitLogWithMetric:
    def test_numeric_min_logs_value_and_marks_achieved(self, client, valid_token):
        """numeric_value 渡しで is_achieved=True 経路に入り streak が更新される"""
        habit = _make_metric_habit("numeric_min", target_value=15, unit="分")
        log = _make_metric_log(numeric_value=20)

        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase, \
             patch("app.api.routes.habits.streak_service") as mock_streak, \
             patch("app.api.routes.habits.badge_service") as mock_badge:

            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value \
                .execute.return_value.data = habit
            mock_sb.table.return_value.upsert.return_value \
                .execute.return_value.data = [log]

            mock_streak.is_achieved.return_value = True
            mock_streak.calculate_streak.return_value = 3
            mock_streak.update_streak.return_value = None
            mock_badge.check_and_award_badges.return_value = None

            response = client.patch(
                f"/api/habits/{TEST_HABIT_ID}/log",
                json={"date": TODAY, "completed": False, "numeric_value": 20},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["data"]["streak"] == 3
        # upsert の payload に numeric_value が含まれていること
        upsert_args = mock_sb.table.return_value.upsert.call_args[0][0]
        assert upsert_args["numeric_value"] == 20

    def test_time_before_logs_time_value(self, client, valid_token):
        """time_value 渡しで upsert payload に time_value が含まれる"""
        habit = _make_metric_habit("time_before", target_time="07:00:00", unit="時刻")
        log = _make_metric_log(time_value="06:45:00")

        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase, \
             patch("app.api.routes.habits.streak_service") as mock_streak, \
             patch("app.api.routes.habits.badge_service") as mock_badge:

            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value \
                .execute.return_value.data = habit
            mock_sb.table.return_value.upsert.return_value \
                .execute.return_value.data = [log]

            mock_streak.is_achieved.return_value = True
            mock_streak.calculate_streak.return_value = 1
            mock_streak.update_streak.return_value = None
            mock_badge.check_and_award_badges.return_value = None

            response = client.patch(
                f"/api/habits/{TEST_HABIT_ID}/log",
                json={"date": TODAY, "completed": False, "time_value": "06:45"},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
        upsert_args = mock_sb.table.return_value.upsert.call_args[0][0]
        assert upsert_args["time_value"] == "06:45"

    def test_numeric_below_threshold_resets_streak(self, client, valid_token):
        """閾値未満の値で is_achieved=False となり streak が 0 リセットされる"""
        habit = _make_metric_habit("numeric_min", target_value=15)
        log = _make_metric_log(numeric_value=5)

        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase, \
             patch("app.api.routes.habits.streak_service") as mock_streak, \
             patch("app.api.routes.habits.badge_service") as mock_badge:

            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value \
                .execute.return_value.data = habit
            mock_sb.table.return_value.upsert.return_value \
                .execute.return_value.data = [log]

            mock_streak.is_achieved.return_value = False

            response = client.patch(
                f"/api/habits/{TEST_HABIT_ID}/log",
                json={"date": TODAY, "completed": False, "numeric_value": 5},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["data"]["streak"] == 0
        assert data["data"]["badge_earned"] is None
        mock_streak.calculate_streak.assert_not_called()
