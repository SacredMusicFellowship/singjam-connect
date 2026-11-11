-- Migration 203: set lists refresh a song live when its tags change (129 did
-- the same for the old song_genres / song_themes / song_cultures tables).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'song_tags'
  ) then
    alter publication supabase_realtime add table public.song_tags;
  end if;
end $$;
