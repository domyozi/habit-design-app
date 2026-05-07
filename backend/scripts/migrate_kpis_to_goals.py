"""
P4: KPI → milestone Goal データ移行スクリプト

実行前提:
  - migration `add_kpis_migrated_to_goal_id.sql` が適用済み（kpis.migrated_to_goal_id 列）
  - migration `add_goals_parent_id_for_hierarchy.sql` が適用済み（goals.parent_goal_id 列）
  - migration `add_habit_goals_junction.sql` が適用済み（habit_goals テーブル）

動作:
  1. is_active=true かつ migrated_to_goal_id IS NULL の kpis を全件読む
  2. 各 kpi について:
     a. 新 Goal を INSERT (kind=milestone 相当: parent_goal_id=kpi.goal_id,
        target_value/unit/metric_type/title 引き継ぎ。target_date=NULL なので
        is_kgi 派生は false → "サブゴール" として表示される)
     b. kpis.migrated_to_goal_id = new_goal.id を UPDATE
     c. kpi_habits の関係を habit_goals にコピー（既存行とは ON CONFLICT で衝突避け）
  3. 既存テーブル kpis / kpi_logs / kpi_habits は **削除しない**（観察期間 + ロールバック余地を残す）

冪等性:
  - 再実行しても migrated_to_goal_id NOT NULL の kpi は処理スキップ
  - habit_goals に同じ (habit_id, goal_id) があれば INSERT ON CONFLICT で skip

ロールバック:
  - 新 Goal を削除（kpis.migrated_to_goal_id を辿る）
  - habit_goals の対応行を削除（そのデータは元 kpi_habits に残っている）
  - kpis.migrated_to_goal_id = NULL に戻す

実行:
  cd backend && .venv/bin/python scripts/migrate_kpis_to_goals.py
"""
from __future__ import annotations

import logging
import os
import sys
from typing import Any

from dotenv import load_dotenv

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


def _format_description(kpi: dict[str, Any]) -> str:
    """元の KPI 由来の補足情報を Goal.description に付ける（運用上の追跡用）。"""
    parts: list[str] = []
    if kpi.get("description"):
        parts.append(kpi["description"])
    freq = kpi.get("tracking_frequency") or "monthly"
    target = kpi.get("target_value")
    unit = kpi.get("unit") or ""
    parts.append(f"(KPI から移行: 集計頻度={freq}, 目標={target}{unit})")
    return "\n".join(parts)


def main(*, dry_run: bool = False) -> int:
    load_dotenv()
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        logger.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です")
        return 1
    client = create_client(url, key)

    # 1. 未移行の active KPI を取得
    res = (
        client.table("kpis")
        .select("*")
        .eq("is_active", True)
        .is_("migrated_to_goal_id", "null")
        .order("created_at")
        .execute()
    )
    kpis = res.data or []
    logger.info("未移行 KPI: %d 件", len(kpis))

    migrated = 0
    skipped = 0
    failed = 0
    for kpi in kpis:
        try:
            kpi_id = kpi["id"]
            user_id = kpi["user_id"]
            parent_goal_id = kpi.get("goal_id")
            if not parent_goal_id:
                logger.warning("kpi %s has no goal_id, skip", kpi_id)
                skipped += 1
                continue

            # 親 Goal が同じ user 所有か念のため確認
            parent_check = (
                client.table("goals")
                .select("id")
                .eq("id", parent_goal_id)
                .eq("user_id", user_id)
                .single()
                .execute()
            )
            if not parent_check.data:
                logger.warning("kpi %s parent goal %s not owned by user, skip", kpi_id, parent_goal_id)
                skipped += 1
                continue

            new_goal_payload = {
                "user_id": user_id,
                "title": kpi["title"],
                "description": _format_description(kpi),
                "parent_goal_id": parent_goal_id,
                "target_value": kpi.get("target_value"),
                "unit": kpi.get("unit"),
                "metric_type": kpi.get("metric_type") or "numeric",
                # target_date は意図的に NULL → is_kgi=false（サブゴール扱い）
                "target_date": None,
                "current_value": None,
                "display_order": kpi.get("display_order") or 0,
                "is_active": True,
            }

            if dry_run:
                logger.info("[dry-run] would INSERT goal: %s", new_goal_payload)
                logger.info("[dry-run] would UPDATE kpi %s with new goal_id", kpi_id)
                migrated += 1
                continue

            # 2-a. 新 Goal を INSERT
            ins = client.table("goals").insert(new_goal_payload).execute()
            if not ins.data:
                logger.error("kpi %s: goal insert returned no data", kpi_id)
                failed += 1
                continue
            new_goal_id = ins.data[0]["id"]

            # 2-b. kpis.migrated_to_goal_id を UPDATE（冪等性）
            client.table("kpis").update({"migrated_to_goal_id": new_goal_id}).eq("id", kpi_id).execute()

            # 2-c. kpi_habits → habit_goals コピー
            kh = (
                client.table("kpi_habits")
                .select("habit_id")
                .eq("kpi_id", kpi_id)
                .execute()
            )
            habit_links = kh.data or []
            for hl in habit_links:
                habit_id = hl["habit_id"]
                # ON CONFLICT (habit_id, goal_id) DO NOTHING に相当する操作
                # supabase-py には ON CONFLICT 構文が薄いので select → insert の 2-step
                exist = (
                    client.table("habit_goals")
                    .select("habit_id")
                    .eq("habit_id", habit_id)
                    .eq("goal_id", new_goal_id)
                    .execute()
                )
                if exist.data:
                    continue
                try:
                    client.table("habit_goals").insert({
                        "habit_id": habit_id,
                        "goal_id": new_goal_id,
                        "user_id": user_id,
                    }).execute()
                except Exception as e:  # noqa: BLE001
                    logger.warning("kpi %s habit_link %s skip: %s", kpi_id, habit_id, e)

            logger.info(
                "kpi %s '%s' → goal %s (linked %d habits)",
                kpi_id, kpi.get("title", "")[:30], new_goal_id, len(habit_links),
            )
            migrated += 1
        except Exception as e:  # noqa: BLE001
            logger.exception("kpi %s migration failed: %s", kpi.get("id"), e)
            failed += 1

    logger.info("=== 完了: migrated=%d skipped=%d failed=%d ===", migrated, skipped, failed)
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    if dry_run:
        logger.info("=== DRY RUN: DB 書き込みをスキップして処理内容のみログ ===")
    code = main(dry_run=dry_run)
    sys.exit(code)
