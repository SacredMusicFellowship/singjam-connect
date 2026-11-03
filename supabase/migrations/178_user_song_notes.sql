-- Migration 178: a member's private notes on a song.
--
-- Kept out of user_songs on purpose: any signed-in member can read user_songs
-- (migration 052), and these notes are for the member alone. Removing a song
-- from a repertoire leaves its notes in place for if it comes back.

create table if not exists public.user_song_notes (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  song_id    uuid not null references public.songs(id) on delete cascade,
  notes      text not null check (char_length(notes) between 1 and 2000),
  updated_at timestamptz not null default now(),
  primary key (user_id, song_id)
);

alter table public.user_song_notes enable row level security;

create policy "user_song_notes_select_own" on public.user_song_notes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "user_song_notes_insert_own" on public.user_song_notes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "user_song_notes_update_own" on public.user_song_notes
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "user_song_notes_delete_own" on public.user_song_notes
  for delete to authenticated using (user_id = (select auth.uid()));

-- No anon grant: the notes are only ever read by their signed-in owner.
grant select, insert, update, delete on public.user_song_notes to authenticated;
grant select, insert, update, delete on public.user_song_notes to service_role;
