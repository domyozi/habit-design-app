-- 表示タイミング (display_window) のカスタマイズ機能 (Sprint v6).
--
-- 既存の固定 4 値 (morning / noon / evening / anytime) を、ユーザーごとに
-- 境界時刻を変更でき、追加の枠も登録できるようにする。データモデル変更:
--   - 新テーブル user_time_windows: ユーザー定義の時間帯マスタ
--   - habits.display_window: text のまま、CHECK 制約を撤去して
--     user_time_windows.key への論理参照に切り替え (FK は張らない:
--     枠削除時はフロントで anytime フォールバックする運用)
--
-- ロールバック:
--   ALTER TABLE habits ADD CONSTRAINT habits_display_window_check
--     CHECK (display_window IN ('morning','noon','evening','anytime'));
--   DROP TABLE IF EXISTS public.user_time_windows;

CREATE TABLE IF NOT EXISTS public.user_time_windows (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key         TEXT NOT NULL,
    label       TEXT NOT NULL,
    start_hour  INT NOT NULL DEFAULT 0 CHECK (start_hour BETWEEN 0 AND 23),
    end_hour    INT NOT NULL DEFAULT 0 CHECK (end_hour BETWEEN 0 AND 23),
    is_anytime  BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, key)
);

COMMENT ON TABLE public.user_time_windows IS 'ユーザーごとの表示タイミング (habit.display_window が key を参照)';
COMMENT ON COLUMN public.user_time_windows.key IS 'habit.display_window が保持する識別子。予約: morning/noon/evening/anytime';
COMMENT ON COLUMN public.user_time_windows.start_hour IS '開始時刻 (時単位)。is_anytime=true のときは未使用';
COMMENT ON COLUMN public.user_time_windows.end_hour IS '終了時刻 (時単位)。end_hour < start_hour のときは 24h 跨ぎ枠 (例: 18→04)';
COMMENT ON COLUMN public.user_time_windows.is_anytime IS 'true なら時刻によらず常時マッチ (anytime 専用フラグ)';

CREATE OR REPLACE FUNCTION public.set_updated_at_user_time_windows()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_time_windows_updated_at ON public.user_time_windows;
CREATE TRIGGER trg_user_time_windows_updated_at
BEFORE UPDATE ON public.user_time_windows
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_user_time_windows();

CREATE INDEX IF NOT EXISTS idx_user_time_windows_user_sort
    ON public.user_time_windows(user_id, sort_order);

ALTER TABLE public.user_time_windows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_time_windows_self_only ON public.user_time_windows;
CREATE POLICY user_time_windows_self_only
    ON public.user_time_windows
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 既存ユーザーへ予約 4 枠を backfill。
-- (新規ユーザーは API 側または auth trigger で同等の seed を作る)
INSERT INTO public.user_time_windows (user_id, key, label, start_hour, end_hour, is_anytime, sort_order)
SELECT u.id, v.key, v.label, v.start_hour, v.end_hour, v.is_anytime, v.sort_order
FROM auth.users u
CROSS JOIN (
    VALUES
        ('anytime', '全日', 0, 0, TRUE, 0),
        ('morning', '朝',   4, 12, FALSE, 1),
        ('noon',    '昼',   12, 18, FALSE, 2),
        ('evening', '夜',   18, 4, FALSE, 3)
) AS v(key, label, start_hour, end_hour, is_anytime, sort_order)
ON CONFLICT (user_id, key) DO NOTHING;

-- habits.display_window の CHECK 制約を撤去 (text のまま、参照先は user_time_windows.key)
ALTER TABLE public.habits
  DROP CONSTRAINT IF EXISTS habits_display_window_check;
