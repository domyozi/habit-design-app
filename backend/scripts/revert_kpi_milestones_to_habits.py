"""
P4-revert: 過剰に作った milestone Goal を巻き戻し、
action-based KPI を Habit として再構成する。

方針 (ユーザー approval 済み, 2026-05-08):
- Action-based KPI (大半) → milestone Goal を削除し、Habit ベースに戻す
  - 既に kpi_habits で紐 habit が居る場合: その habit_goals 紐付けを
    milestone Goal → parent KGI に **付け替え**
  - 紐 habit が居ない場合: KPI 内容で **新規 Habit を作成** し parent KGI に紐付け
- Outcome-based KPI (一部) → milestone Goal のまま **保持**

KEEP_TITLES = outcome 指標として残す KPI title。それ以外は revert 対象。

冪等性: kpis.migrated_to_goal_id = NULL に戻すので、再実行時にもう対象外になる。

実行:
  cd backend && .venv/bin/python scripts/revert_kpi_milestones_to_habits.py --dry-run
  cd backend && .venv/bin/python scripts/revert_kpi_milestones_to_habits.py
"""
from __future__ import annotations

import logging
import os
import sys

from dotenv import load_dotenv

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# Outcome 指標として milestone Goal で keep する KPI title リスト
KEEP_TITLES = {
    "副業・スキル収入の月次売上",
    "月間フォロワー純増数",
}


def main(*, dry_run: bool = False) -> int:
    load_dotenv()
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    client = create_client(url, key)

    # 1. migrated 済 KPI を取得
    res = (
        client.table("kpis")
        .select("*")
        .not_.is_("migrated_to_goal_id", "null")
        .order("created_at")
        .execute()
    )
    kpis = res.data or []
    logger.info("対象 migrated KPI: %d 件", len(kpis))

    reverted = 0
    kept = 0
    new_habits = 0
    failed = 0

    for kpi in kpis:
        try:
            kpi_id = kpi["id"]
            title = kpi["title"]
            user_id = kpi["user_id"]
            milestone_id = kpi["migrated_to_goal_id"]
            parent_kgi_id = kpi["goal_id"]  # 元 KPI の goal_id = parent KGI

            if title in KEEP_TITLES:
                logger.info("KEEP (milestone): '%s'", title)
                kept += 1
                continue

            # Habit-class: revert
            # 1) 紐 habit を取得
            kh = client.table("kpi_habits").select("habit_id").eq("kpi_id", kpi_id).execute()
            linked_habit_ids = [r["habit_id"] for r in (kh.data or [])]

            if linked_habit_ids:
                # 既存 habit を parent KGI に再紐付け
                # まず milestone Goal に紐付いている habit_goals 行を、parent KGI の goal_id に書き換える
                # ただし parent KGI に対して既に同じ habit が紐付いている場合は重複なので skip + delete
                for habit_id in linked_habit_ids:
                    # parent KGI に既に紐付いてるかチェック
                    existing_parent = (
                        client.table("habit_goals")
                        .select("habit_id")
                        .eq("habit_id", habit_id)
                        .eq("goal_id", parent_kgi_id)
                        .execute()
                    )
                    if existing_parent.data:
                        # 既に親に紐付いてる → milestone 側の行だけ消せば良い
                        if dry_run:
                            logger.info(
                                "[dry-run] '%s': habit '%s' は既に parent KGI 紐付き、milestone 側 habit_goals のみ削除",
                                title, habit_id[:8],
                            )
                        else:
                            client.table("habit_goals").delete().eq("habit_id", habit_id).eq(
                                "goal_id", milestone_id
                            ).execute()
                    else:
                        # parent に未紐付 → milestone の habit_goals を update して付け替え
                        if dry_run:
                            logger.info(
                                "[dry-run] '%s': habit '%s' を milestone → parent KGI に付け替え",
                                title, habit_id[:8],
                            )
                        else:
                            client.table("habit_goals").update(
                                {"goal_id": parent_kgi_id}
                            ).eq("habit_id", habit_id).eq("goal_id", milestone_id).execute()
            else:
                # 紐 habit なし → 新規 Habit を作って parent KGI に紐付け
                # DB schema に存在する列のみ。proof_type/source_kind/xp_base は
                # Pydantic 側のデフォルト値で、実 DB には無い (要 migration 別途)
                new_habit_payload = {
                    "user_id": user_id,
                    "goal_id": parent_kgi_id,
                    "title": title,
                    "description": "(KPI から自動変換)",
                    "frequency": "daily",
                    "is_active": True,
                    "metric_type": "binary",  # 行動系の標準
                    "target_value": kpi.get("target_value"),
                    "unit": kpi.get("unit"),
                    "display_order": 0,
                }
                if dry_run:
                    logger.info(
                        "[dry-run] '%s': 新規 Habit INSERT (target=%s, unit=%s)",
                        title, kpi.get("target_value"), kpi.get("unit"),
                    )
                else:
                    ins = client.table("habits").insert(new_habit_payload).execute()
                    new_habit_id = ins.data[0]["id"] if ins.data else None
                    if new_habit_id:
                        # habit_goals 紐付け
                        client.table("habit_goals").insert(
                            {
                                "habit_id": new_habit_id,
                                "goal_id": parent_kgi_id,
                                "user_id": user_id,
                            }
                        ).execute()
                        logger.info(
                            "'%s': 新規 Habit %s 作成 + parent KGI 紐付け",
                            title, new_habit_id[:8],
                        )
                        new_habits += 1

            # 2) milestone Goal を削除
            if dry_run:
                logger.info("[dry-run] '%s': milestone Goal %s を DELETE", title, milestone_id[:8])
            else:
                client.table("goals").delete().eq("id", milestone_id).execute()

            # 3) kpis.migrated_to_goal_id = NULL に戻す (rollback marker)
            if dry_run:
                logger.info("[dry-run] '%s': kpis.migrated_to_goal_id を NULL に戻す", title)
            else:
                client.table("kpis").update({"migrated_to_goal_id": None}).eq("id", kpi_id).execute()

            reverted += 1
        except Exception as e:  # noqa: BLE001
            logger.exception("kpi %s revert failed: %s", kpi.get("title"), e)
            failed += 1

    logger.info(
        "=== 完了: reverted=%d (新 Habit 作成 %d) / kept=%d / failed=%d ===",
        reverted, new_habits, kept, failed,
    )
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    if dry_run:
        logger.info("=== DRY RUN: DB 書き込みをスキップ ===")
    sys.exit(main(dry_run=dry_run))
