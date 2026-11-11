-- Migration 188: mechanical song-data clean-up. Every change here is derived
-- from the data itself, not from outside facts:
--   1. merge duplicate artists and songwriters (spelling/punctuation variants)
--   2. replace the U+2010 hyphen lookalike with "-" in titles and names
--   3. drop MusicBrainz's "[unknown]" placeholder songwriter
--   4. fix obvious title typos and lowercase titles
--   5. fold three duplicate songs into the copy people actually use
--   6. re-sync songs.display_artist with the linked recording artists
--   7. delete artists and songwriters no song links to

create or replace function pg_temp.merge_artist(from_name text, to_name text) returns void
language plpgsql as $$
declare f uuid; t uuid;
begin
  select id into f from public.artists where name = from_name;
  if f is null then return; end if;
  select id into t from public.artists where name = to_name;
  if t is null then
    update public.artists set name = to_name where id = f;
    return;
  end if;
  update public.song_recording_artists set artist_id = t
  where artist_id = f
    and song_id not in (select song_id from public.song_recording_artists where artist_id = t);
  delete from public.artists where id = f;
end $$;

create or replace function pg_temp.merge_person(from_name text, to_name text) returns void
language plpgsql as $$
declare f uuid; t uuid;
begin
  select id into f from public.people where name = from_name;
  if f is null then return; end if;
  select id into t from public.people where name = to_name;
  if t is null then
    update public.people set name = to_name where id = f;
    return;
  end if;
  update public.song_composers set person_id = t
  where person_id = f
    and song_id not in (select song_id from public.song_composers where person_id = t);
  update public.song_lyricists set person_id = t
  where person_id = f
    and song_id not in (select song_id from public.song_lyricists where person_id = t);
  delete from public.people where id = f;
end $$;

-- 1. Duplicate artists and songwriters
select pg_temp.merge_artist(f, t) from (values
  ('Beatles', 'The Beatles'),
  ('Depeche Mood', 'Depeche Mode'),
  ('Doors', 'The Doors'),
  ('Drifters', 'The Drifters'),
  ('The Grateful Dead', 'Grateful Dead'),
  ('Guns N’ Roses', 'Guns N'' Roses'),
  ('Irish Rovers', 'The Irish Rovers'),
  ('Peter, Paul, & Mary', 'Peter, Paul and Mary'),
  ('Smashing Pumpkins', 'The Smashing Pumpkins'),
  ('bad company', 'Bad Company'),
  ('pink', 'P!nk')
) as v(f, t);

select pg_temp.merge_person(f, t) from (values
  ('Dolores O’Riordan', 'Dolores O''Riordan'),
  ('Ed O’Brien', 'Ed O''Brien'),
  ('Clarence “Sonny” Henry', 'Clarence "Sonny" Henry')
) as v(f, t);

-- 2. U+2010 hyphen lookalike → "-" (merging where the plain spelling exists)
select pg_temp.merge_artist(name, replace(name, '‐', '-')) from public.artists where name like '%‐%';
select pg_temp.merge_person(name, replace(name, '‐', '-')) from public.people where name like '%‐%';
update public.songs set title = replace(title, '‐', '-') where title like '%‐%';
update public.song_alternate_titles set title = replace(title, '‐', '-') where title like '%‐%';

-- 3. "[unknown]" is a MusicBrainz placeholder, not a songwriter
delete from public.people where name = '[unknown]';

-- 4. Title typos and lowercase titles
update public.songs set title = 'With A Little Help From My Friends' where title = 'With A Litte Help From My Friends';
update public.songs set title = 'Save the Last Dance for Me' where title = 'Save the Last the Dance for Me';
update public.songs set title = 'Shooting Star' where title = 'shooting star';
update public.songs set title = 'Just Give Me a Reason' where title = 'just give me a reason';

-- 5. Duplicate songs. The copies being removed have no repertoire, set or note
--    rows; their recording artists and songwriters move to the kept copy.
-- "Just Give Me a Reason": keep f2128790 (in repertoires and a set).
update public.song_composers set song_id = 'f2128790-bbb2-4f81-95ed-be042e7eb179'
where song_id = '7e9c1dad-f2b6-4f10-bca1-5eb95f0b2c9b'
  and person_id not in (select person_id from public.song_composers where song_id = 'f2128790-bbb2-4f81-95ed-be042e7eb179');
update public.song_lyricists set song_id = 'f2128790-bbb2-4f81-95ed-be042e7eb179'
where song_id = '7e9c1dad-f2b6-4f10-bca1-5eb95f0b2c9b'
  and person_id not in (select person_id from public.song_lyricists where song_id = 'f2128790-bbb2-4f81-95ed-be042e7eb179');
update public.song_recording_artists set song_id = 'f2128790-bbb2-4f81-95ed-be042e7eb179', position = 1
where song_id = '7e9c1dad-f2b6-4f10-bca1-5eb95f0b2c9b'
  and artist_id not in (select artist_id from public.song_recording_artists where song_id = 'f2128790-bbb2-4f81-95ed-be042e7eb179');
delete from public.songs where id = '7e9c1dad-f2b6-4f10-bca1-5eb95f0b2c9b'
  and not exists (select 1 from public.user_songs where song_id = '7e9c1dad-f2b6-4f10-bca1-5eb95f0b2c9b')
  and not exists (select 1 from public.set_songs where song_id = '7e9c1dad-f2b6-4f10-bca1-5eb95f0b2c9b');

-- "You Gotta Be": keep d3e2fec2 (Des'ree, in a repertoire).
update public.song_recording_artists set song_id = 'd3e2fec2-db36-4dca-8402-33e4796fc7c9', position = 1
where song_id = '1c9df4f5-322c-43e2-956f-7d881806bfc9'
  and artist_id not in (select artist_id from public.song_recording_artists where song_id = 'd3e2fec2-db36-4dca-8402-33e4796fc7c9');
delete from public.songs
where id in ('1c9df4f5-322c-43e2-956f-7d881806bfc9', 'f4f65d6c-52d0-4fe3-bd37-cf5d9b5325af')
  and not exists (select 1 from public.user_songs us where us.song_id = songs.id)
  and not exists (select 1 from public.set_songs ss where ss.song_id = songs.id);

-- 6. display_artist mirrors the recording artists, as the admin editor writes it
update public.songs s
set display_artist = r.names
from (
  select sra.song_id, string_agg(a.name, ', ' order by sra.position nulls last, a.name) as names
  from public.song_recording_artists sra
  join public.artists a on a.id = sra.artist_id
  group by sra.song_id
) r
where r.song_id = s.id and s.display_artist is distinct from r.names;

-- 7. Orphans
delete from public.artists a
where not exists (select 1 from public.song_recording_artists sra where sra.artist_id = a.id);
delete from public.people p
where not exists (select 1 from public.song_composers sc where sc.person_id = p.id)
  and not exists (select 1 from public.song_lyricists sl where sl.person_id = p.id);
