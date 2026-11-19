-- Migration 190: fold three duplicate songs into the copy people already use.
-- Found by the new same-song check (sameSong in core), which the add-song flow
-- now runs before creating anything:
--   "The Sound of Silence" (added 2026-11-05)        → "The Sounds of Silence", retitled
--   "When You're Strange" (a lyric line)             → "People Are Strange"
--   "Feelin’ Groovy"                                 → "The 59th Street Bridge Song (Feelin' Groovy)"
-- Repertoire entries, set entries, notes, recordings and alternate titles move to
-- the kept song; where a person or set already has the kept song, that entry
-- wins. Tags move only when the kept song has none, so the 3-tag limit holds.
-- Empty fields on the kept song are filled from the duplicate, and the
-- duplicate's slug becomes former_slug so old links still resolve.

create or replace function pg_temp.merge_song(dup uuid, keep uuid) returns void
language plpgsql as $$
declare d public.songs%rowtype;
begin
  select * into d from public.songs where id = dup;
  if not found or not exists (select 1 from public.songs where id = keep) then return; end if;

  update public.user_songs set song_id = keep
  where song_id = dup and user_id not in (select user_id from public.user_songs where song_id = keep);
  update public.set_songs set song_id = keep
  where song_id = dup and set_id not in (select set_id from public.set_songs where song_id = keep);
  update public.user_song_notes set song_id = keep
  where song_id = dup and user_id not in (select user_id from public.user_song_notes where song_id = keep);

  update public.song_recording_artists k set
    year = coalesce(k.year, r.year),
    youtube_url = coalesce(k.youtube_url, r.youtube_url),
    spotify_url = coalesce(k.spotify_url, r.spotify_url)
  from public.song_recording_artists r
  where k.song_id = keep and r.song_id = dup and r.artist_id = k.artist_id;
  update public.song_recording_artists set song_id = keep,
    position = coalesce(position, 0) + (select coalesce(max(position), 0) + 1 from public.song_recording_artists where song_id = keep)
  where song_id = dup and artist_id not in (select artist_id from public.song_recording_artists where song_id = keep);

  if not exists (select 1 from public.song_composers where song_id = keep) and not exists (select 1 from public.song_lyricists where song_id = keep) then
    update public.song_composers set song_id = keep where song_id = dup;
    update public.song_lyricists set song_id = keep where song_id = dup;
  end if;
  if not exists (select 1 from public.song_genres where song_id = keep) then update public.song_genres set song_id = keep where song_id = dup; end if;
  if not exists (select 1 from public.song_themes where song_id = keep) then update public.song_themes set song_id = keep where song_id = dup; end if;
  if not exists (select 1 from public.song_languages where song_id = keep) then update public.song_languages set song_id = keep where song_id = dup; end if;
  if not exists (select 1 from public.song_cultures where song_id = keep) then update public.song_cultures set song_id = keep where song_id = dup; end if;
  if not exists (select 1 from public.song_productions where song_id = keep) then update public.song_productions set song_id = keep where song_id = dup; end if;

  update public.song_alternate_titles set song_id = keep
  where song_id = dup
    and lower(replace(title, '’', '''')) not in (
      select lower(replace(title, '’', '''')) from public.song_alternate_titles where song_id = keep
      union select lower(replace(title, '’', '''')) from public.songs where id = keep);
  insert into public.song_alternate_titles (song_id, title)
  select keep, d.title
  where lower(replace(d.title, '’', '''')) not in (
    select lower(replace(title, '’', '''')) from public.song_alternate_titles where song_id = keep
    union select lower(replace(title, '’', '''')) from public.songs where id = keep);

  update public.songs k set
    first_line = coalesce(k.first_line, d.first_line),
    hook = coalesce(k.hook, d.hook),
    tonality = coalesce(k.tonality, d.tonality),
    meter = coalesce(k.meter, d.meter),
    vibe = coalesce(k.vibe, d.vibe),
    year_written = coalesce(k.year_written, d.year_written),
    chord_chart_url = coalesce(k.chord_chart_url, d.chord_chart_url),
    genius_url = coalesce(k.genius_url, d.genius_url),
    youtube_url = coalesce(k.youtube_url, d.youtube_url),
    notes = coalesce(k.notes, d.notes),
    former_slug = coalesce(k.former_slug, d.slug),
    updated_at = now()
  where k.id = keep;

  delete from public.songs where id = dup;
end $$;

select pg_temp.merge_song('7a833a82-20d7-4f85-a8a2-f781d1f85014', '547db00f-2eb8-4415-954c-6c15268223b6');
select pg_temp.merge_song('42914502-b39a-432e-b4eb-2a0dd4469894', 'f1c4d715-cee9-4aef-8812-076462c024e3');
select pg_temp.merge_song('e441fdad-e879-4234-956f-0ca2d364a2ef', '4a335298-ccd8-47b5-bb63-3bc1cc822394');

-- The song is "The Sound of Silence"; the 1965 single's "Sounds" stays findable.
update public.songs set title = 'The Sound of Silence' where id = '547db00f-2eb8-4415-954c-6c15268223b6';
delete from public.song_alternate_titles
where song_id = '547db00f-2eb8-4415-954c-6c15268223b6' and lower(title) = 'the sound of silence';
insert into public.song_alternate_titles (song_id, title)
select '547db00f-2eb8-4415-954c-6c15268223b6', 'The Sounds of Silence'
where exists (select 1 from public.songs where id = '547db00f-2eb8-4415-954c-6c15268223b6')
  and not exists (select 1 from public.song_alternate_titles where song_id = '547db00f-2eb8-4415-954c-6c15268223b6' and lower(title) = 'the sounds of silence');
