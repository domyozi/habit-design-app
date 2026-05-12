-- 2026-05-13: user_context に timezone (IANA name) を追加。
--
-- 背景: サーバー (Railway, UTC) で date.today() を呼ぶと、JST のユーザーが
-- 朝に操作したときに前日扱いされる「日付ずれ問題」が複数 endpoint で発生。
-- primary_target.py だけ client_today パッチで一時対応したが、scheduler や
-- 自律ロジックでは client から TZ を渡せないため、user_context に持つ。
--
-- 形式: IANA timezone name ("Asia/Tokyo", "America/Los_Angeles" 等)
-- NULL 許容: 「未登録」を区別できるようにする (既存ユーザーは NULL から開始 → FE が
--          ブラウザ TZ を登録する)。backend の get_user_timezone は NULL を
--          DEFAULT_TZ ("Asia/Tokyo") にフォールバックするので障害なく動く。
-- 設定経路: ログイン初回時に FE が Intl.DateTimeFormat().resolvedOptions().timeZone
--           で取得して PATCH /api/user-context する。

ALTER TABLE public.user_context
  ADD COLUMN IF NOT EXISTS timezone TEXT;
