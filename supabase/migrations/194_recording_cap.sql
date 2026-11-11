-- A song lists at most 4 recordings: its defining versions, not a discography.
-- Mirrors MAX_RECORDINGS in packages/core (formatRecordingArtists.ts).
--
-- BEFORE INSERT fires for upserts too, even when the row already exists, so the
-- count leaves out the row being written: re-saving a song's 4 recordings passes,
-- adding a 5th is refused.

create or replace function public.enforce_recording_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('song_recording_artists:' || new.song_id::text));
  if (
    select count(*) from public.song_recording_artists
    where song_id = new.song_id and artist_id <> new.artist_id
  ) >= 4 then
    raise exception 'A song can list at most 4 recordings. Remove one to add another.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_recording_cap on public.song_recording_artists;
create trigger enforce_recording_cap
  before insert or update of song_id, artist_id on public.song_recording_artists
  for each row execute function public.enforce_recording_cap();
