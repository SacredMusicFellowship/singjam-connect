-- "Everywhere" was added with the artist typed "Fleewood Mac". The Spotify match
-- missed the typo, so it became a new artist and the song lost its recording
-- links. Move the recording to Fleetwood Mac with its Spotify track and the
-- band's official video, and drop the misspelled artist.
do $$
declare
  v_song uuid := '2d3d219d-8071-4b52-93f2-4a2ef2d130ec';
  v_typo uuid := (select id from public.artists where name = 'Fleewood Mac');
  v_band uuid := (select id from public.artists where name = 'Fleetwood Mac');
begin
  if v_typo is null or v_band is null then return; end if;
  update public.song_recording_artists
     set artist_id = v_band,
         spotify_url = 'https://open.spotify.com/track/254bXAqt3zP6P50BdQvEsq',
         youtube_url = 'https://www.youtube.com/watch?v=YF1R0hc5Q2I'
   where song_id = v_song and artist_id = v_typo;
  update public.songs set display_artist = 'Fleetwood Mac' where id = v_song and display_artist = 'Fleewood Mac';
  delete from public.artists a
   where a.id = v_typo
     and not exists (select 1 from public.song_recording_artists r where r.artist_id = a.id);
end $$;
