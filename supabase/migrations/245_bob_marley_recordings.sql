-- Bob Marley recordings (catalogue review, 2026-11-19). Each change is keyed by
-- id and only applies while the row still holds the old value, so the file does
-- nothing on databases without these rows.

-- No Woman No Cry, Simmer Down and Stir It Up were credited to the recording
-- artist "Bob Marley", but every release of them is by Bob Marley & The Wailers
-- (or, early on, The Wailers). They move to that artist, and the solo artist,
-- used by nothing else, is removed. The songwriter Bob Marley is unchanged.
update public.song_recording_artists set artist_id = '794f799a-5532-4de3-b9a6-0a1ca3751c77'
where artist_id = '7f5ac7fe-3bad-42e9-a4ab-2be77a712ca9'
  and song_id in ('8daf8e8d-23fb-42e6-a79a-1bd1d9629110', 'd9e7a55c-17d0-4f11-9594-92736b01e047', '44fdfeaa-7405-43f5-85f6-89c84419847a')
  and not exists (
    select 1 from public.song_recording_artists w
    where w.song_id = song_recording_artists.song_id and w.artist_id = '794f799a-5532-4de3-b9a6-0a1ca3751c77');

update public.songs set display_artist = 'Bob Marley & The Wailers', updated_at = now()
where id in ('8daf8e8d-23fb-42e6-a79a-1bd1d9629110', 'd9e7a55c-17d0-4f11-9594-92736b01e047', '44fdfeaa-7405-43f5-85f6-89c84419847a')
  and display_artist = 'Bob Marley';

delete from public.artists a
where a.id = '7f5ac7fe-3bad-42e9-a4ab-2be77a712ca9'
  and not exists (select 1 from public.song_recording_artists r where r.artist_id = a.id);

-- Recording years were reissue or compilation dates. Each is now the first
-- release of the song by the group, per MusicBrainz.
update public.song_recording_artists r set year = v.new_year
from (values
  ('ce3c10cf-45f2-408f-927f-6892aa00038f'::uuid, 1989, 1970), -- Duppy Conqueror: 1970 single
  ('ea128ecb-0ba6-444d-905e-df26d94a8dae'::uuid, 1987, 1973), -- I Shot the Sheriff: Burnin' (1973)
  ('cd6bf1f0-2899-4cde-97ca-35aee95179bc'::uuid, 1987, 1974), -- Lively Up Yourself: Natty Dread (1974)
  ('d7066a9d-d10a-4948-bdb9-ab7a939562d6'::uuid, 1982, 1973), -- Rastaman Chant: Burnin' (1973)
  ('d9e7a55c-17d0-4f11-9594-92736b01e047'::uuid, 1992, 1964), -- Simmer Down: 1964 single
  ('44fdfeaa-7405-43f5-85f6-89c84419847a'::uuid, 1987, 1968), -- Stir It Up: 1968 single
  ('9b1756a5-0245-48b0-a772-0f74b7574270'::uuid, 1988, 1973)  -- Stop That Train: Catch a Fire (1973)
) as v(song_id, old_year, new_year)
where r.song_id = v.song_id
  and r.artist_id = '794f799a-5532-4de3-b9a6-0a1ca3751c77'
  and r.year = v.old_year;
