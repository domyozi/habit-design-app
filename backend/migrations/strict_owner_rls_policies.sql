-- Make owner-only RLS policies explicit for writes as well as reads.
-- Public read-only master data such as badge_definitions is intentionally unchanged.

do $$
declare
  r record;
begin
  for r in
    select * from (
      values
        ('user_context', 'user_id', 'user_context: own rows only'),
        ('wanna_be', 'user_id', 'wanna_be_self_only'),
        ('goals', 'user_id', 'goals_self_only'),
        ('habits', 'user_id', 'habits_self_only'),
        ('habit_logs', 'user_id', 'habit_logs_self_only'),
        ('failure_reasons', 'user_id', 'failure_reasons_self_only'),
        ('journal_entries', 'user_id', 'journal_entries_self_only'),
        ('weekly_reviews', 'user_id', 'weekly_reviews_self_only'),
        ('user_badges', 'user_id', 'user_badges_self_only'),
        ('todo_definitions', 'user_id', 'todo_definitions: own rows only'),
        ('daily_logs', 'user_id', 'daily_logs: own rows only'),
        ('ops_tasks', 'user_id', 'ops_tasks: own rows only'),
        ('tasks', 'user_id', 'tasks: own rows only'),
        ('primary_targets', 'user_id', 'primary_targets: own rows only'),
        ('primary_target_days', 'user_id', 'primary_target_days: own rows only'),
        ('monthly_targets', 'user_id', 'monthly_targets: own rows only'),
        ('health_logs', 'user_id', 'health_logs_self_only'),
        ('mandala_charts', 'user_id', 'mandala_charts_self_only'),
        ('kpis', 'user_id', 'kpis: users can manage own kpis'),
        ('kpi_logs', 'user_id', 'kpi_logs: users can manage own logs'),
        ('kpi_habits', 'user_id', 'kpi_habits: users can manage own links'),
        ('notes', 'user_id', 'users can manage their own notes')
    ) as t(table_name, owner_column, policy_name)
  loop
    if to_regclass('public.' || r.table_name) is not null then
      execute format('alter table public.%I enable row level security', r.table_name);
      execute format('drop policy if exists %I on public.%I', r.policy_name, r.table_name);
      execute format(
        'create policy %I on public.%I for all to authenticated using (%I = auth.uid()) with check (%I = auth.uid())',
        r.policy_name,
        r.table_name,
        r.owner_column,
        r.owner_column
      );
    end if;
  end loop;
end $$;

alter table public.user_profiles enable row level security;
drop policy if exists user_profiles_self_only on public.user_profiles;
create policy user_profiles_self_only
  on public.user_profiles
  for all
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
