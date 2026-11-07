-- Migration 128: backfill RLS policies that were created in the Supabase
-- dashboard on production and never captured in a migration.
--
-- 134_rls_initplan_auth_uid.sql runs `alter policy` on these, so a fresh
-- database (local dev, e2e) fails at 134 without them. Bodies use plain
-- auth.uid(); 134 and 143 rewrite them into their production shape.
--
-- Fresh databases only: production already has these, and 146 deliberately
-- dropped the two jam_invites INSERT policies there, so this must never
-- recreate them. email_outbox (149) exists on any database that has run the
-- later migrations, so its presence turns this into a no-op.

do $$
begin
  if to_regclass('public.email_outbox') is not null then
    return;
  end if;

  create policy "authenticated insert jam_invites" on public.jam_invites
    for insert with check (auth.uid() = invited_user_id);

  create policy "host and attendees read jam_invites" on public.jam_invites
    for select using (
      auth.uid() = invited_user_id
      or exists (
        select 1 from public.jams
        where jams.id = jam_invites.jam_id and jams.host_user_id = auth.uid()
      )
    );

  create policy "own delete jam_invites" on public.jam_invites
    for delete using (auth.uid() = invited_user_id);

  create policy "own update jam_invites" on public.jam_invites
    for update using (auth.uid() = invited_user_id);

  create policy "authenticated insert jams" on public.jams
    for insert with check (auth.uid() = host_user_id);

  create policy "host delete jams" on public.jams
    for delete using (auth.uid() = host_user_id);

  create policy "host update jams" on public.jams
    for update using (auth.uid() = host_user_id);

  -- Production replaced 001's user_songs policies with these renamed ones.
  drop policy if exists "read own user_songs" on public.user_songs;
  drop policy if exists "upsert own user_songs" on public.user_songs;
  drop policy if exists "update own user_songs" on public.user_songs;

  create policy "user_songs_read_own" on public.user_songs
    for select to authenticated using (user_id = auth.uid());

  create policy "user_songs_insert_own" on public.user_songs
    for insert to authenticated with check (user_id = auth.uid());

  create policy "user_songs_update_own" on public.user_songs
    for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

  create policy "user_songs_delete_own" on public.user_songs
    for delete to authenticated using (user_id = auth.uid());
end
$$;
