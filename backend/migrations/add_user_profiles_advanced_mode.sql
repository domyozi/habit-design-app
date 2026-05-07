-- P0: Settings の Advanced モード toggle 用フィールド
--
-- 目的: ユーザーが Advanced モードを ON にすると以下が解放される（フロント実装は別 PR）:
--   - Goal 階層 (parent_goal_id) の編集 UI
--   - Habit を複数 Goal に紐付ける UI
--   - Legacy KPI 画面の表示（移行期間中）
--
-- 既定値は false（普通のユーザーはフラット運用）。
-- 既存 KPI を持つユーザーは 後続 migration で true にバックフィルする。

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS advanced_mode BOOLEAN NOT NULL DEFAULT false;

-- 既存 KPI を 1 件以上 active で持つユーザーは Advanced=true でブートストラップ
-- （彼らは既に複雑な構造を運用しているので、Advanced UI を見たいはず）
UPDATE public.user_profiles up
SET advanced_mode = true
WHERE EXISTS (
    SELECT 1 FROM public.kpis k
    WHERE k.user_id = up.id AND k.is_active = true
);
