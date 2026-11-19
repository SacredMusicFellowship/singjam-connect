-- Where a song's notes came from, so song editors can tell automatic notes
-- from ones a person wrote. The automatic fill sets 'wikipedia' (written from
-- the song's Wikipedia article) or 'ai' (one model's answer from memory).
-- Notes a person typed or edited have no source.

alter table public.songs
  add column if not exists notes_source text
  check (notes_source in ('wikipedia', 'ai'));

-- Any change to the notes that doesn't also set the source (an editor's save
-- through save_song, or any other update) clears it, and so do empty notes.
create or replace function public.songs_clear_notes_source()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.notes is null
     or (new.notes is distinct from old.notes and new.notes_source is not distinct from old.notes_source) then
    new.notes_source := null;
  end if;
  return new;
end;
$$;

drop trigger if exists songs_clear_notes_source on public.songs;
create trigger songs_clear_notes_source
  before update of notes, notes_source on public.songs
  for each row execute function public.songs_clear_notes_source();
