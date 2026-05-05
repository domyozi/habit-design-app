from unittest.mock import MagicMock, patch


TEST_USER_ID = "00000000-0000-0000-0000-000000000001"


class Chain:
    def __init__(self, data=None):
        self.data = data if data is not None else []
        self.inserted = None
        self.updated = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def insert(self, *args, **_kwargs):
        self.inserted = args[0] if args else None
        return self

    def update(self, *args, **_kwargs):
        self.updated = args[0] if args else None
        return self

    def delete(self, *_args, **_kwargs):
        return self

    def execute(self):
        return type("Result", (), {"data": self.data})()


def test_create_task_sets_user_and_defaults(client, valid_token):
    with patch("app.api.routes.tasks.get_supabase") as mock_get:
        table = Chain(
            [
                {
                    "id": "task-1",
                    "user_id": TEST_USER_ID,
                    "title": "接着剤を買う",
                    "status": "inbox",
                    "source": "flow_coach",
                }
            ]
        )
        mock_sb = MagicMock()
        mock_sb.table.return_value = table
        mock_get.return_value = mock_sb

        response = client.post(
            "/api/tasks",
            json={"title": "接着剤を買う", "source": "flow_coach"},
            headers={"Authorization": f"Bearer {valid_token}"},
        )

    assert response.status_code == 201
    body = response.json()
    assert body["user_id"] == TEST_USER_ID
    assert body["status"] == "inbox"


def test_create_task_rejects_invalid_source(client, valid_token):
    with patch("app.api.routes.tasks.get_supabase") as mock_get:
        response = client.post(
            "/api/tasks",
            json={"title": "X", "source": "unknown"},
            headers={"Authorization": f"Bearer {valid_token}"},
        )

    assert response.status_code == 400
    mock_get.assert_not_called()


def test_create_non_completed_task_clears_completed_at(client, valid_token):
    with patch("app.api.routes.tasks.get_supabase") as mock_get:
        table = Chain(
            [
                {
                    "id": "task-1",
                    "user_id": TEST_USER_ID,
                    "title": "未完了",
                    "status": "inbox",
                    "completed_at": None,
                }
            ]
        )
        mock_sb = MagicMock()
        mock_sb.table.return_value = table
        mock_get.return_value = mock_sb

        response = client.post(
            "/api/tasks",
            json={
                "title": "未完了",
                "status": "inbox",
                "completed_at": "2026-05-04T00:00:00+00:00",
            },
            headers={"Authorization": f"Bearer {valid_token}"},
        )

    assert response.status_code == 201
    assert response.json()["completed_at"] is None
    assert table.inserted["completed_at"] is None


def test_update_completed_sets_completed_at(client, valid_token):
    with patch("app.api.routes.tasks.get_supabase") as mock_get:
        table = Chain(
            [
                {
                    "id": "task-1",
                    "user_id": TEST_USER_ID,
                    "title": "完了する",
                    "status": "completed",
                    "completed_at": "2026-05-04T00:00:00+00:00",
                }
            ]
        )
        mock_sb = MagicMock()
        mock_sb.table.return_value = table
        mock_get.return_value = mock_sb

        response = client.patch(
            "/api/tasks/task-1",
            json={"status": "completed"},
            headers={"Authorization": f"Bearer {valid_token}"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"


def test_weekly_stats_counts_this_week(client, valid_token):
    with patch("app.api.routes.tasks.get_supabase") as mock_get:
        table = Chain(
            [
                {
                    "status": "completed",
                    "completed_at": "2026-05-04T10:00:00+00:00",
                    "scheduled_at": None,
                },
                {
                    "status": "scheduled",
                    "completed_at": None,
                    "scheduled_at": "2026-05-05T10:00:00+00:00",
                },
                {
                    "status": "completed",
                    "completed_at": "2026-04-20T10:00:00+00:00",
                    "scheduled_at": None,
                },
            ]
        )
        mock_sb = MagicMock()
        mock_sb.table.return_value = table
        mock_get.return_value = mock_sb

        response = client.get(
            "/api/tasks/stats/weekly?week_start=2026-05-04",
            headers={"Authorization": f"Bearer {valid_token}"},
        )

    assert response.status_code == 200
    assert response.json() == {"week_start": "2026-05-04", "completed": 1, "total": 2}
