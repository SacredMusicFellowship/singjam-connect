-- "Here We Come A Wassailing" (added 2026-11-20 on the add-hints dev build): the
-- Spotify match was credited to "Traditional", which became a recording artist,
-- and the YouTube preview the person confirmed was dropped because it isn't an
-- "official upload" by that artist. The stand-in artist goes (no other song uses
-- it), the confirmed video becomes the song's own, and the title takes the usual
-- hyphen (Wikipedia, hymnals). Keyed by id and the old values: a no-op elsewhere.
delete from public.song_recording_artists r
using public.artists a
where r.artist_id = a.id and a.name = 'Traditional'
  and r.song_id = '025faf8f-9de7-463a-b99d-098eb40bd1a2';

delete from public.artists a
where a.name = 'Traditional'
  and not exists (select 1 from public.song_recording_artists r where r.artist_id = a.id);

update public.songs set
  title = 'Here We Come A-Wassailing',
  display_artist = null,
  youtube_url = 'https://www.youtube.com/watch?v=7CeQBbUKgSI',
  updated_at = now()
where id = '025faf8f-9de7-463a-b99d-098eb40bd1a2'
  and title = 'Here We Come A Wassailing';
