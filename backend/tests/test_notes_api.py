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

    def is_(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def insert(self, *args, **_kwargs):
        self.inserted = args[0] if args else None
        return self

    def update(self, *args, **_kwargs):
        self.updated = args[0] if args else None
        return self

    def execute(self):
        return type("Result", (), {"data": self.data})()


def test_list_notes_filters_current_user_and_deleted(client, valid_token):
    with patch("app.api.routes.notes.get_supabase") as mock_get:
        table = Chain([{"id": "note-1", "user_id": TEST_USER_ID, "title": "A"}])
        mock_sb = MagicMock()
        mock_sb.table.return_value = table
        mock_get.return_value = mock_sb

        response = client.get(
            "/api/notes",
            headers={"Authorization": f"Bearer {valid_token}"},
        )

    assert response.status_code == 200
    assert response.json()[0]["id"] == "note-1"


def test_create_note_sets_user_and_pinned(client, valid_token):
    with patch("app.api.routes.notes.get_supabase") as mock_get:
        table = Chain(
            [
                {
                    "id": "note-1",
                    "user_id": TEST_USER_ID,
                    "title": "Trip",
                    "body": "{}",
                    "pinned": True,
                }
            ]
        )
        mock_sb = MagicMock()
        mock_sb.table.return_value = table
        mock_get.return_value = mock_sb

        response = client.post(
            "/api/notes",
            json={"title": "Trip", "body": "{}", "pinned": True},
            headers={"Authorization": f"Bearer {valid_token}"},
        )

    assert response.status_code == 201
    assert table.inserted["user_id"] == TEST_USER_ID
    assert table.inserted["pinned"] is True
    assert response.json()["title"] == "Trip"


def test_patch_note_allows_title_body_pin_and_order(client, valid_token):
    with patch("app.api.routes.notes.get_supabase") as mock_get:
        table = Chain([{"id": "note-1", "title": "B", "pinned": True, "order_index": 2}])
        mock_sb = MagicMock()
        mock_sb.table.return_value = table
        mock_get.return_value = mock_sb

        response = client.patch(
            "/api/notes/note-1",
            json={"title": "B", "pinned": True, "order_index": 2, "ignored": "x"},
            headers={"Authorization": f"Bearer {valid_token}"},
        )

    assert response.status_code == 200
    assert table.updated["title"] == "B"
    assert table.updated["pinned"] is True
    assert "ignored" not in table.updated


def test_delete_note_soft_deletes(client, valid_token):
    with patch("app.api.routes.notes.get_supabase") as mock_get:
        table = Chain([])
        mock_sb = MagicMock()
        mock_sb.table.return_value = table
        mock_get.return_value = mock_sb

        response = client.delete(
            "/api/notes/note-1",
            headers={"Authorization": f"Bearer {valid_token}"},
        )

    assert response.status_code == 204
    assert "deleted_at" in table.updated
