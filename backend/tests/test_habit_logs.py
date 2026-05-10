"""
習慣ログ・ストリーク・バッジ API テスト (TASK-0008)

テスト対象:
- PATCH /api/habits/{id}/log : ログ記録・ストリーク更新・バッジ付与
- POST  /api/habits/{id}/failure-reason : 未達成理由記録
- streak_service.calculate_streak() : ストリーク計算ロジック
- badge_service.check_and_award_badges() : バッジ付与ロジック

🔵 信頼性レベル: TASK-0008要件定義・api-endpoints.md より
"""
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest

TEST_USER_ID = "00000000-0000-0000-0000-000000000001"
OTHER_USER_ID = "00000000-0000-0000-0000-000000000099"
TEST_HABIT_ID = "00000000-0000-0000-0000-000000000020"
TEST_LOG_ID = "00000000-0000-0000-0000-000000000040"
TODAY = str(date.today())


def _make_habit(user_id=TEST_USER_ID, current_streak=0, longest_streak=0):
    return {
        "id": TEST_HABIT_ID,
        "user_id": user_id,
        "goal_id": None,
        "title": "ランニング30分",
        "description": None,
        "frequency": "daily",
        "scheduled_time": "07:00",
        "display_order": 0,
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "is_active": True,
        "wanna_be_connection_text": None,
        "created_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
    }


def _make_log(completed=True, log_date=TODAY):
    return {
        "id": TEST_LOG_ID,
        "habit_id": TEST_HABIT_ID,
        "user_id": TEST_USER_ID,
        "log_date": log_date,
        "completed": completed,
        "completed_at": None,
        "input_method": "manual",
        "created_at": "2026-04-14T07:30:00+00:00",
    }


def _make_badge_def(badge_id="streak_7", condition_value=7):
    return {
        "id": badge_id,
        "name": f"{condition_value}日連続",
        "description": f"同じ習慣を{condition_value}日連続達成",
        "condition_type": "streak",
        "condition_value": condition_value,
        "icon_name": "flame",
    }


def _make_user_badge(badge_id="streak_7"):
    return {
        "id": "00000000-0000-0000-0000-000000000050",
        "user_id": TEST_USER_ID,
        "badge_id": badge_id,
        "habit_id": TEST_HABIT_ID,
        "earned_at": "2026-04-14T07:30:00+00:00",
        "badge": _make_badge_def(badge_id),
    }


# ==================================================
# PATCH /api/habits/{id}/log テスト
# ==================================================

class TestUpdateHabitLog:
    """PATCH /api/habits/{habit_id}/log のテスト"""

    def test_log_record_streak_update_normal(self, client, valid_token):
        """
        TC-001: ログ記録・ストリーク更新（正常系）

        【テスト目的】: completed=true でログが記録され、streak が返ること
        【期待される動作】: 200, success=true, streak=2, badge_earned=null
        🔵 信頼性レベル: REQ-501 より
        """
        habit = _make_habit(current_streak=1, longest_streak=1)
        log = _make_log(completed=True)

        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase, \
             patch("app.api.routes.habits.streak_service") as mock_streak, \
             patch("app.api.routes.habits.badge_service") as mock_badge:

            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb

            # 所有者確認
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value \
                .execute.return_value.data = habit

            # ログUPSERT
            mock_sb.table.return_value.upsert.return_value \
                .execute.return_value.data = [log]

            # 達成判定（binary 想定）
            mock_streak.is_achieved.return_value = True
            # ストリーク計算
            mock_streak.calculate_streak.return_value = 2
            mock_streak.update_streak.return_value = None

            # バッジ付与なし
            mock_badge.check_and_award_badges.return_value = None

            response = client.patch(
                f"/api/habits/{TEST_HABIT_ID}/log",
                json={"date": TODAY, "completed": True},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200  # 【確認内容】: 正常レスポンス 🔵
        data = response.json()
        assert data["success"] is True  # 【確認内容】: success=true 🔵
        assert data["data"]["streak"] == 2  # 【確認内容】: streak=2 🔵
        assert data["data"]["badge_earned"] is None  # 【確認内容】: バッジなし 🔵
        mock_streak.calculate_streak.assert_called_once()  # 【確認内容】: streak計算を呼んだ 🔵
        mock_streak.update_streak.assert_called_once()  # 【確認内容】: streak更新を呼んだ 🔵

    def test_log_streak_reset_on_incomplete(self, client, valid_token):
        """
        TC-002: completed=false でストリークがリセットされること

        【テスト目的】: 未達成時に current_streak=0 になること
        【期待される動作】: 200, streak=0, badge_earned=null
        🔵 信頼性レベル: REQ-503 より
        """
        habit = _make_habit(current_streak=5, longest_streak=5)
        log = _make_log(completed=False)

        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase, \
             patch("app.api.routes.habits.streak_service") as mock_streak, \
             patch("app.api.routes.habits.badge_service") as mock_badge:

            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb

            # 所有者確認
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value \
                .execute.return_value.data = habit

            # ログUPSERT
            mock_sb.table.return_value.upsert.return_value \
                .execute.return_value.data = [log]

            # 達成判定: completed=false なので未達成
            mock_streak.is_achieved.return_value = False

            response = client.patch(
                f"/api/habits/{TEST_HABIT_ID}/log",
                json={"date": TODAY, "completed": False},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200  # 【確認内容】: 正常レスポンス 🔵
        data = response.json()
        assert data["success"] is True  # 【確認内容】: success=true 🔵
        assert data["data"]["streak"] == 0  # 【確認内容】: streak=0（リセット） 🔵
        assert data["data"]["badge_earned"] is None  # 【確認内容】: バッジなし 🔵
        mock_streak.calculate_streak.assert_not_called()  # 【確認内容】: streak計算は呼ばない 🔵
        # is_active を更新するチェーンが呼ばれていること（update + eq）
        mock_sb.table.return_value.update.assert_called()

    def test_log_badge_awarded_on_streak_7(self, client, valid_token):
        """
        TC-003: streak=7 達成時にバッジが付与されること

        【テスト目的】: streak_7 バッジが付与されること
        【期待される動作】: 200, streak=7, badge_earned={streak_7バッジ}
        🔵 信頼性レベル: REQ-901 より
        """
        habit = _make_habit(current_streak=6, longest_streak=6)
        log = _make_log(completed=True)
        badge = _make_user_badge("streak_7")

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
            mock_streak.calculate_streak.return_value = 7
            mock_streak.update_streak.return_value = None
            mock_badge.check_and_award_badges.return_value = badge

            response = client.patch(
                f"/api/habits/{TEST_HABIT_ID}/log",
                json={"date": TODAY, "completed": True},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200  # 【確認内容】: 正常レスポンス 🔵
        data = response.json()
        assert data["data"]["streak"] == 7  # 【確認内容】: streak=7 🔵
        assert data["data"]["badge_earned"] is not None  # 【確認内容】: バッジあり 🔵
        assert data["data"]["badge_earned"]["badge_id"] == "streak_7"  # 【確認内容】: streak_7バッジ 🔵

    def test_log_no_auth_returns_401(self, client):
        """
        TC-010: 未認証で 401

        【期待される動作】: 401
        🔵 信頼性レベル: NFR-101 より
        """
        response = client.patch(
            f"/api/habits/{TEST_HABIT_ID}/log",
            json={"date": TODAY, "completed": True},
        )
        assert response.status_code == 401  # 【確認内容】: 未認証で401 🔵

    def test_log_other_user_habit_returns_403(self, client, valid_token):
        """
        TC-009: 他ユーザーの習慣へのログ記録で 403

        【期待される動作】: 403
        🔵 信頼性レベル: NFR-101 より
        """
        other_habit = _make_habit(user_id=OTHER_USER_ID)

        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value \
                .execute.return_value.data = other_habit

            response = client.patch(
                f"/api/habits/{TEST_HABIT_ID}/log",
                json={"date": TODAY, "completed": True},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 403  # 【確認内容】: 他ユーザーの習慣は403 🔵


# ==================================================
# POST /api/habits/{id}/failure-reason テスト
# ==================================================

class TestCreateFailureReason:
    """POST /api/habits/{habit_id}/failure-reason のテスト"""

    def test_create_failure_reason_success(self, client, valid_token):
        """
        TC-007: 未達成理由記録（正常）

        【テスト目的】: 有効なリクエストで failure_reason が記録されること
        【期待される動作】: 201, success=true
        🔵 信頼性レベル: REQ-406 より
        """
        habit = _make_habit()
        habit_log = {"id": TEST_LOG_ID}
        failure_reason = {
            "id": "00000000-0000-0000-0000-000000000060",
            "habit_log_id": TEST_LOG_ID,
            "user_id": TEST_USER_ID,
            "reason": "体調が悪かった",
            "created_at": "2026-04-14T07:30:00+00:00",
        }

        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb

            # 所有者確認
            mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single.return_value \
                .execute.return_value.data = habit

            # ログ検索（二回目のsingle呼び出し）
            # 注: モックの挙動を単純化するため、2回目の呼び出しで habit_log を返す
            call_count = {"n": 0}

            def side_effect_single():
                mock_result = MagicMock()
                if call_count["n"] == 0:
                    mock_result.execute.return_value.data = habit
                else:
                    mock_result.execute.return_value.data = habit_log
                call_count["n"] += 1
                return mock_result

            two_eq_single = mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single
            three_eq_single = mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.eq.return_value.single
            two_eq_single.side_effect = side_effect_single
            three_eq_single.side_effect = side_effect_single

            # INSERT
            mock_sb.table.return_value.insert.return_value \
                .execute.return_value.data = [failure_reason]

            response = client.post(
                f"/api/habits/{TEST_HABIT_ID}/failure-reason",
                json={"reason": "体調が悪かった", "log_date": TODAY},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 201  # 【確認内容】: 201 Created 🔵
        data = response.json()
        assert data["success"] is True  # 【確認内容】: success=true 🔵
        assert data["data"]["reason"] == "体調が悪かった"  # 【確認内容】: 理由が一致 🔵

    def test_create_failure_reason_no_log_returns_404(self, client, valid_token):
        """
        TC-008: 対応するログがない場合 404

        【テスト目的】: habit_log が存在しない場合 404 が返ること
        【期待される動作】: 404
        🔵 信頼性レベル: api-endpoints.md より
        """
        habit = _make_habit()

        with patch("app.api.routes.habits.get_supabase") as mock_get_supabase:
            mock_sb = MagicMock()
            mock_get_supabase.return_value = mock_sb

            call_count = {"n": 0}

            def side_effect_single():
                mock_result = MagicMock()
                if call_count["n"] == 0:
                    mock_result.execute.return_value.data = habit
                else:
                    mock_result.execute.return_value.data = None  # ログなし
                call_count["n"] += 1
                return mock_result

            two_eq_single = mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.single
            three_eq_single = mock_sb.table.return_value.select.return_value \
                .eq.return_value.eq.return_value.eq.return_value.single
            two_eq_single.side_effect = side_effect_single
            three_eq_single.side_effect = side_effect_single

            response = client.post(
                f"/api/habits/{TEST_HABIT_ID}/failure-reason",
                json={"reason": "体調が悪かった", "log_date": TODAY},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 404  # 【確認内容】: ログなしで404 🔵


# ==================================================
# streak_service ユニットテスト
# ==================================================

class TestCalculateStreak:
    """streak_service.calculate_streak() のユニットテスト"""

    def test_consecutive_5_days(self):
        """
        TC-006: 5日連続達成のストリーク計算

        【テスト目的】: 5日連続 completed=true のログから streak=5 が返ること
        【期待される動作】: current_streak=5
        🔵 信頼性レベル: REQ-501/502 より
        """
        from app.services.streak_service import calculate_streak

        today = date.today()
        mock_sb = MagicMock()

        # 5日分の completed=true ログ
        # Sprint habit-skip: skip-aware に変えたため status / completed も含めて返す。
        logs = [
            {"log_date": str(today - timedelta(days=i)), "completed": True, "status": "done"}
            for i in range(5)
        ]
        mock_sb.table.return_value.select.return_value \
            .eq.return_value.eq.return_value \
            .execute.return_value.data = logs

        streak = calculate_streak(mock_sb, TEST_HABIT_ID, TEST_USER_ID, today)

        assert streak == 5  # 【確認内容】: 5日連続で streak=5 🔵

    def test_streak_after_break(self):
        """
        TC-007: 途切れた後のストリーク計算

        【テスト目的】: 途切れ日があると、途切れ以降のストリークのみカウントされること
        【シナリオ】: 7日前〜5日前は達成、4日前は未達成、3日前〜今日は達成 → streak=4
        【期待される動作】: current_streak=4
        🔵 信頼性レベル: REQ-503 より
        """
        from app.services.streak_service import calculate_streak

        today = date.today()
        mock_sb = MagicMock()

        # completed=true のログ: 3日前〜今日（4日分）+ 5日前〜7日前（3日分）
        # 4日前は欠けている（途切れ）
        # Sprint habit-skip: skip-aware fetch のため completed/status を含めて返す。
        logs = (
            [
                {"log_date": str(today - timedelta(days=i)), "completed": True, "status": "done"}
                for i in range(4)
            ]  # 今日〜3日前
            + [
                {"log_date": str(today - timedelta(days=i)), "completed": True, "status": "done"}
                for i in range(5, 8)
            ]  # 5日前〜7日前
        )
        mock_sb.table.return_value.select.return_value \
            .eq.return_value.eq.return_value \
            .execute.return_value.data = logs

        streak = calculate_streak(mock_sb, TEST_HABIT_ID, TEST_USER_ID, today)

        assert streak == 4  # 【確認内容】: 4日前で途切れ → streak=4 🔵

    def test_no_logs_returns_zero(self):
        """
        TC-011: ログなしで streak=0

        【期待される動作】: streak=0
        🔵 信頼性レベル: REQ-501 より
        """
        from app.services.streak_service import calculate_streak

        mock_sb = MagicMock()
        mock_sb.table.return_value.select.return_value \
            .eq.return_value.eq.return_value \
            .execute.return_value.data = []

        streak = calculate_streak(mock_sb, TEST_HABIT_ID, TEST_USER_ID, date.today())

        assert streak == 0  # 【確認内容】: ログなしで0 🔵

    def test_timezone_boundary(self):
        """
        TC-005: タイムゾーン境界値テスト（EDGE-102）

        【テスト目的】: ユーザータイムゾーン換算済みの log_date で正しく計算されること
        【シナリオ】: JST（UTC+9）での日付 2026-04-14 を使用
        【期待される動作】: JST基準の日付セットでストリーク計算が正しく動作する
        🔵 信頼性レベル: EDGE-102 より
        """
        from app.services.streak_service import calculate_streak

        jst_today = date(2026, 4, 14)
        mock_sb = MagicMock()

        # JST基準の過去2日分のログ
        # Sprint habit-skip: skip-aware fetch のため completed/status を含めて返す。
        logs = [
            {"log_date": "2026-04-14", "completed": True, "status": "done"},  # 今日（JST）
            {"log_date": "2026-04-13", "completed": True, "status": "done"},  # 昨日（JST）
        ]
        mock_sb.table.return_value.select.return_value \
            .eq.return_value.eq.return_value \
            .execute.return_value.data = logs

        streak = calculate_streak(mock_sb, TEST_HABIT_ID, TEST_USER_ID, jst_today)

        assert streak == 2  # 【確認内容】: JST基準で正しく計算 🔵

    def test_skip_does_not_break_streak(self):
        """
        Sprint habit-skip: status='skipped' の日は streak を切らないが、
        streak のカウントにも入らない（その日を「予定されていない日」として扱う）。

        【シナリオ】: 今日 done, 昨日 skip, 一昨日 done → streak=2
        【期待される動作】: skip 日は walk-back では読み飛ばされる
        """
        from app.services.streak_service import calculate_streak

        today = date.today()
        mock_sb = MagicMock()

        logs = [
            {"log_date": str(today), "completed": True, "status": "done"},
            {"log_date": str(today - timedelta(days=1)), "completed": False, "status": "skipped"},
            {"log_date": str(today - timedelta(days=2)), "completed": True, "status": "done"},
        ]
        mock_sb.table.return_value.select.return_value \
            .eq.return_value.eq.return_value \
            .execute.return_value.data = logs

        streak = calculate_streak(mock_sb, TEST_HABIT_ID, TEST_USER_ID, today)

        # 今日 + 一昨日 を done としてカウント、昨日 skip は読み飛ばす → streak=2
        assert streak == 2


# ==================================================
# badge_service ユニットテスト
# ==================================================

class TestCheckAndAwardBadges:
    """badge_service.check_and_award_badges() のユニットテスト"""

    def test_no_badge_awarded_on_low_streak(self):
        """
        TC-012: streak が低い場合はバッジなし

        【期待される動作】: None
        🔵 信頼性レベル: REQ-901 より
        """
        from app.services.badge_service import check_and_award_badges

        mock_sb = MagicMock()
        # 対象バッジなし
        mock_sb.table.return_value.select.return_value \
            .eq.return_value.lte.return_value.order.return_value \
            .execute.return_value.data = []

        result = check_and_award_badges(mock_sb, TEST_USER_ID, TEST_HABIT_ID, streak=2)

        assert result is None  # 【確認内容】: バッジなし 🔵

    def test_no_duplicate_badge(self):
        """
        TC-004: バッジの重複付与なし

        【テスト目的】: 既に streak_7 バッジ取得済みの場合は再付与されないこと
        【期待される動作】: None（重複付与しない）
        🔵 信頼性レベル: REQ-901 より
        """
        from app.services.badge_service import check_and_award_badges

        mock_sb = MagicMock()
        badge_def = _make_badge_def("streak_7", 7)

        # 対象バッジ定義あり
        mock_sb.table.return_value.select.return_value \
            .eq.return_value.lte.return_value.order.return_value \
            .execute.return_value.data = [badge_def]

        # 既に取得済み
        existing_badge_check = MagicMock()
        existing_badge_check.execute.return_value.data = [{"id": "existing"}]  # 取得済み

        mock_sb.table.return_value.select.return_value \
            .eq.return_value.eq.return_value.eq.return_value \
            .execute.return_value.data = [{"id": "existing"}]

        result = check_and_award_badges(mock_sb, TEST_USER_ID, TEST_HABIT_ID, streak=7)

        assert result is None  # 【確認内容】: 重複付与なし 🔵

    def test_badge_awarded_on_first_streak_7(self):
        """
        TC-003-b: 初めて streak=7 を達成した場合はバッジが付与されること

        【期待される動作】: バッジが返る
        🔵 信頼性レベル: REQ-901 より
        """
        from app.services.badge_service import check_and_award_badges

        mock_sb = MagicMock()
        badge_def = _make_badge_def("streak_7", 7)
        user_badge = _make_user_badge("streak_7")

        # 対象バッジ定義あり
        # streak条件バッジ検索
        badges_mock = MagicMock()
        badges_mock.execute.return_value.data = [badge_def]
        mock_sb.table.return_value.select.return_value \
            .eq.return_value.lte.return_value.order.return_value = badges_mock

        # 既存バッジチェック → 未取得
        existing_mock = MagicMock()
        existing_mock.execute.return_value.data = []
        mock_sb.table.return_value.select.return_value \
            .eq.return_value.eq.return_value.eq.return_value = existing_mock

        # 付与
        mock_sb.table.return_value.insert.return_value \
            .execute.return_value.data = [user_badge]

        result = check_and_award_badges(mock_sb, TEST_USER_ID, TEST_HABIT_ID, streak=7)

        assert result is not None  # 【確認内容】: バッジが付与された 🔵
        assert result["badge_id"] == "streak_7"  # 【確認内容】: streak_7バッジ 🔵
