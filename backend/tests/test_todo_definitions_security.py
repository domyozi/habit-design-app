from unittest.mock import MagicMock, patch


TEST_USER_ID = "00000000-0000-0000-0000-000000000001"
OTHER_USER_ID = "00000000-0000-0000-0000-000000000099"


def test_upsert_todo_definitions_rejects_other_user_id(client, valid_token):
    """既存の他ユーザーIDを指定したupsertは user_id 上書き前に拒否する。"""
    with patch("app.api.routes.todo_definitions.get_supabase") as mock_get:
        mock_sb = MagicMock()
        mock_get.return_value = mock_sb
        mock_sb.table.return_value.select.return_value.in_.return_value.execute.return_value.data = [
            {"id": "todo-other", "user_id": OTHER_USER_ID}
        ]

        response = client.post(
            "/api/todo-definitions",
            json=[
                {
                    "id": "todo-other",
                    "label": "他ユーザーの定義",
                    "section": "system",
                    "timing": "morning",
                }
            ],
            headers={"Authorization": f"Bearer {valid_token}"},
        )

    assert response.status_code == 403
    mock_sb.table.return_value.upsert.assert_not_called()
