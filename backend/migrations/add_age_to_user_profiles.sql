-- user_profiles に age カラムを追加。
-- 利用開始時に年齢を確認し、AI への語調・難易度ヒントとして渡す。
-- granularity（child/student/adult）の代替として導入。

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS age INT
    CHECK (age IS NULL OR (age >= 0 AND age <= 150));
