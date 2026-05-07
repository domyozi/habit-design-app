-- P1: Goal 階層対応
--
-- 目的:
--   - 「KGI → milestone」のツリーを表現可能にする (Advanced モード時のみ UI に出す)
--   - 既存 Goal は parent_goal_id=NULL (= トップレベル KGI/単独 Goal) として維持
--   - kind フィールドは新設しない: トップレベル/子の区別は parent_goal_id で derive する
--
-- 制約:
--   - 自己参照 FK、循環参照は backend / DB 制約では検査せず frontend でガード
--   - ON DELETE SET NULL: 親が消えても子は残す（孤児化＝top-level 化）
--
-- 既存の `is_kgi` フィールドはそのまま: 「定量化ゴールか否か」のフラグとして温存。
-- 新モデルでは parent_goal_id と is_kgi を組み合わせて以下を表現:
--   - parent_goal_id IS NULL  AND is_kgi=false  → 質的 KGI（"転職成功" のような vision）
--   - parent_goal_id IS NULL  AND is_kgi=true   → 定量 KGI（"年収 800万 達成"）
--   - parent_goal_id IS NOT NULL AND is_kgi=true → milestone（"TOEIC 800点" 等）
--   - parent_goal_id IS NOT NULL AND is_kgi=false → 質的 sub-goal（あまり使わない）

ALTER TABLE public.goals
    ADD COLUMN IF NOT EXISTS parent_goal_id UUID
    REFERENCES public.goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS goals_parent_goal_id_idx
    ON public.goals (parent_goal_id)
    WHERE parent_goal_id IS NOT NULL;
