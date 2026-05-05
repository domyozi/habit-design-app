-- Sprint A-dnd: habits の display_order を 1 トランザクションで一括更新する RPC。
--
-- なぜ必要か:
--   N+1 PATCH /habits/{id} (display_order=i) を並列発火すると、部分失敗時の整合性が崩れる。
--   このストアド関数を 1 つの SQL で呼び出すことで、全行更新を Postgres トランザクションに
--   閉じ込められる。
--
-- 設計（v2 で auth.uid() が NULL になり no-op 化したため修正）:
--   - backend は service_role キーで接続するため、関数内の auth.uid() は NULL になる。
--   - ↑ これだと WHERE user_id = auth.uid() が常に偽になり何も更新されない。
--   - そのため target_user_id を引数で受け取り、関数内ではこれを使う方式に変更。
--   - backend はこの関数を呼ぶ前に「全 habit_ids が target_user_id 所有か」を必ず検証する。
--   - 関数自体は SECURITY INVOKER のまま（不正引数で他人の habit を勝手に書けない設計を維持）。
--
-- ロールバック:
--   DROP FUNCTION IF EXISTS public.reorder_habits(UUID, UUID[]);
--   DROP FUNCTION IF EXISTS public.reorder_habits(UUID[]);

-- 旧シグネチャ (UUID[] のみ) を削除（auth.uid() = NULL で無効化されていたもの）
DROP FUNCTION IF EXISTS public.reorder_habits(UUID[]);

CREATE OR REPLACE FUNCTION public.reorder_habits(
    target_user_id UUID,
    habit_ids UUID[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    i INT;
BEGIN
    IF habit_ids IS NULL OR array_length(habit_ids, 1) IS NULL THEN
        RETURN;
    END IF;

    FOR i IN 1..array_length(habit_ids, 1) LOOP
        UPDATE public.habits
           SET display_order = i - 1,
               updated_at = now()
         WHERE id = habit_ids[i]
           AND user_id = target_user_id;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_habits(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_habits(UUID, UUID[]) TO service_role;
