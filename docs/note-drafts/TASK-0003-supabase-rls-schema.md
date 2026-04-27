# Supabase の RLS（Row Level Security）を設計する：「全テーブルに有効化」が鉄則な理由

## この記事でわかること

- Supabase の RLS とは何か・なぜ必要か
- 10テーブル構成のアプリで RLS ポリシーをどう設計したか
- `auth.users` と `public.user_profiles` を連携させる自動トリガーの実装

---

## 背景：RLS は「後から入れる」とデータ漏洩事故になる

Supabase は PostgreSQL をバックエンドに持ち、anon key を使えばフロントエンドから直接 DB にアクセスできる。
これは開発の速度を上げる一方で、**RLS を設定しないと全ユーザーの全データが丸見えになる**という危険を持つ。

「後で設定しよう」が最も危険。最初から全テーブルに有効化するのが鉄則だ。

---

## RLS の設計パターン

このアプリで採用したのは「**auth.uid() = user_id の行のみ操作可能**」というシンプルな原則。

```sql
-- 例: user_profiles テーブルの RLS ポリシー
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles_select_own"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "user_profiles_insert_own"
  ON public.user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "user_profiles_update_own"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
```

**USING vs WITH CHECK の違い：**
- `USING` → 既存行を「読む・更新・削除」するときの条件
- `WITH CHECK` → 新規行を「書く・更新後の値」を検証する条件

INSERT には `WITH CHECK` だけ、UPDATE には両方が必要。この使い分けは最初混乱しやすい。

---

## テーブル設計の全体像（10テーブル）

```
user_profiles      ← Supabase Auth と連携
wanna_be           ← 「なりたい自分」の定義（user_id FK）
goals              ← 長期目標（user_id FK）
habits             ← 習慣定義（user_id FK）
habit_logs         ← 日次記録（user_id FK）
failure_reasons    ← 未達成理由（user_id FK）
journal_entries    ← 3行日報（user_id FK）
weekly_reviews     ← 週次レビュー（user_id FK）
badge_definitions  ← マスターデータ（全ユーザー共通・SELECT のみ）
user_badges        ← 取得バッジ（user_id FK）
```

`badge_definitions` だけ「全ユーザーが読み取り可能・書き込み不可」という例外ポリシーを設定した。

```sql
-- マスターデータは全員が読める
CREATE POLICY "badge_definitions_select_all"
  ON public.badge_definitions FOR SELECT
  USING (true);
```

---

## 実装のポイント：ユーザー作成トリガー

Supabase Auth でログインしたユーザーを `public.user_profiles` に自動登録するトリガー。

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;  -- ← ここが重要

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**`SECURITY DEFINER` が重要な理由：**
通常、関数は呼び出したユーザーの権限で実行される（`SECURITY INVOKER`）。
`SECURITY DEFINER` を付けると関数の所有者（superuser）の権限で実行され、
anon ユーザーでも `user_profiles` に INSERT できるようになる。

これがないと「OAuthログイン成功 → プロフィール作成失敗」という謎のバグが起きる。

---

## RLS 有効化の確認コマンド

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

全テーブルの `rowsecurity` が `true` になっていることを確認。
1行でも `false` があれば、そのテーブルは全データが外部から読める状態。

---

## ハマったこと：新しい Supabase API キー形式

2024年以降、Supabase の API キー形式が変わった。

| 旧形式 | 新形式 |
|--------|--------|
| `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | `sb_publishable_...` (anon key) |
| 同上（別値） | `sb_secret_...` (service_role key) |

`@supabase/supabase-js` v2 は新旧どちらも互換性あり。
ドキュメントに "Legacy" と書いてあっても動くので焦らなくて良い。

---

## アーキテクト視点のまとめ

RLS の設計で意識したこと：

1. **デフォルト拒否** — ポリシーがなければアクセス不可。ホワイトリスト方式で考える
2. **最小権限原則** — ユーザーは自分のデータにだけアクセスできる
3. **マスターデータの例外** — 全ユーザー共通のデータは `USING (true)` で READ のみ許可
4. **バックエンドは service_role で bypass** — API サーバーは RLS を迂回してビジネスロジックを実行

**次回**: FastAPI での JWT 検証ミドルウェア実装と Supabase Auth の連携
