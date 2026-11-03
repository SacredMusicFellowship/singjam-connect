-- Migration 179: removing a song from a repertoire also deletes the member's
-- private notes on it (reverses 178's "leave notes in place").
--
-- The key lives on the user_songs row and goes with it; notes are a separate
-- table, so a trigger keeps every delete path (single remove, bulk remove,
-- account deletion, both apps) consistent in one place.

create or replace function public.delete_user_song_notes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.user_song_notes
  where user_id = old.user_id and song_id = old.song_id;
  return old;
end;
$$;

revoke execute on function public.delete_user_song_notes() from public, anon, authenticated;

drop trigger if exists user_songs_delete_notes on public.user_songs;
create trigger user_songs_delete_notes
  after delete on public.user_songs
  for each row execute function public.delete_user_song_notes();
