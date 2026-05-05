alter table public.user_profiles
  add column if not exists shortcuts_token_hash text;

alter table public.user_profiles
  alter column shortcuts_token drop default;

create unique index if not exists idx_user_profiles_shortcuts_token_hash
  on public.user_profiles (shortcuts_token_hash)
  where shortcuts_token_hash is not null;
