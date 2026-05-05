"""
マンダラチャート API テスト
Sprint 1: F-02/F-03 のユニットテスト

【テスト対象】:
  GET  /api/mandala  - 認証ユーザーの最新マンダラ取得
  POST /api/mandala  - マンダラ保存（upsert）

【テストケース】:
  TC-MANDALA-01: 未登録時の GET で 204 が返る
  TC-MANDALA-02: 保存済みマンダラの GET で cells が返る
  TC-MANDALA-03: POST で新規マンダラが保存される
  TC-MANDALA-04: POST で既存マンダラが更新される（upsert）
  TC-MANDALA-05: 未認証の GET で 403 が返る
  TC-MANDALA-06: 未認証の POST で 403 が返る
"""
from unittest.mock import MagicMock, patch

import pytest


TEST_CELLS = {
    "center": "理想の自分",
    "grid": [["a", "b", "c"], ["d", "e", "f"], ["g", "h", "i"]],
}

TEST_MANDALA_ID = "11111111-1111-1111-1111-111111111111"
TEST_WANNA_BE_ID = "22222222-2222-2222-2222-222222222222"


class TestGetMandala:
    """GET /api/mandala のテスト"""

    def test_no_mandala_returns_204(self, client, valid_token):
        """TC-MANDALA-01: 未登録時に 204 が返る"""
        with patch("app.api.routes.mandala.get_supabase") as mock_get:
            mock_sb = MagicMock()
            mock_get.return_value = mock_sb
            (
                mock_sb.table.return_value.select.return_value
                .eq.return_value.order.return_value.limit.return_value.execute.return_value
                .data
            ) = []

            response = client.get(
                "/api/mandala",
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 204

    def test_existing_mandala_returns_data(self, client, valid_token):
        """TC-MANDALA-02: 保存済みマンダラが返る"""
        TEST_USER_ID = "00000000-0000-0000-0000-000000000001"

        mock_record = {
            "id": TEST_MANDALA_ID,
            "user_id": TEST_USER_ID,
            "wanna_be_id": None,
            "cells": TEST_CELLS,
            "created_at": "2026-04-26T00:00:00+00:00",
        }

        with patch("app.api.routes.mandala.get_supabase") as mock_get:
            mock_sb = MagicMock()
            mock_get.return_value = mock_sb
            (
                mock_sb.table.return_value.select.return_value
                .eq.return_value.order.return_value.limit.return_value.execute.return_value
                .data
            ) = [mock_record]

            response = client.get(
                "/api/mandala",
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["id"] == TEST_MANDALA_ID
        assert body["data"]["cells"] == TEST_CELLS

    def test_unauthenticated_get_returns_401(self, client):
        """TC-MANDALA-05: 未認証の GET で 401 が返る"""
        response = client.get("/api/mandala")
        assert response.status_code == 401


class TestSaveMandala:
    """POST /api/mandala のテスト"""

    def test_insert_new_mandala(self, client, valid_token):
        """TC-MANDALA-03: 既存レコードなし → 新規 INSERT"""
        TEST_USER_ID = "00000000-0000-0000-0000-000000000001"

        saved_record = {
            "id": TEST_MANDALA_ID,
            "user_id": TEST_USER_ID,
            "wanna_be_id": None,
            "cells": TEST_CELLS,
            "created_at": "2026-04-26T00:00:00+00:00",
        }

        with patch("app.api.routes.mandala.get_supabase") as mock_get:
            mock_sb = MagicMock()
            mock_get.return_value = mock_sb
            # 既存レコードなし
            (
                mock_sb.table.return_value.select.return_value
                .eq.return_value.order.return_value.limit.return_value.execute.return_value
                .data
            ) = []
            # INSERT の結果
            mock_sb.table.return_value.insert.return_value.execute.return_value.data = [saved_record]

            response = client.post(
                "/api/mandala",
                json={"cells": TEST_CELLS},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["id"] == TEST_MANDALA_ID
        assert body["data"]["cells"] == TEST_CELLS

    def test_update_existing_mandala(self, client, valid_token):
        """TC-MANDALA-04: 既存レコードあり → UPDATE（upsert）"""
        TEST_USER_ID = "00000000-0000-0000-0000-000000000001"

        new_cells = {"center": "更新後", "grid": []}
        updated_record = {
            "id": TEST_MANDALA_ID,
            "user_id": TEST_USER_ID,
            "wanna_be_id": None,
            "cells": new_cells,
            "created_at": "2026-04-26T00:00:00+00:00",
        }

        with patch("app.api.routes.mandala.get_supabase") as mock_get:
            mock_sb = MagicMock()
            mock_get.return_value = mock_sb
            # 既存レコードあり
            (
                mock_sb.table.return_value.select.return_value
                .eq.return_value.order.return_value.limit.return_value.execute.return_value
                .data
            ) = [{"id": TEST_MANDALA_ID}]
            # UPDATE の結果
            (
                mock_sb.table.return_value.update.return_value
                .eq.return_value.eq.return_value.execute.return_value.data
            ) = [updated_record]

            response = client.post(
                "/api/mandala",
                json={"cells": new_cells},
                headers={"Authorization": f"Bearer {valid_token}"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["cells"] == new_cells

    def test_unauthenticated_post_returns_401(self, client):
        """TC-MANDALA-06: 未認証の POST で 401 が返る"""
        response = client.post(
            "/api/mandala",
            json={"cells": TEST_CELLS},
        )
        assert response.status_code == 401
