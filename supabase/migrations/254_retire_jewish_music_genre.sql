-- Migration 254: retire the "Jewish Music" genre.
--
-- It was a top-level genre whose four children all have another parent
-- (Klezmer and Israeli Folk under Folk; Cantorial and Contemporary Jewish
-- under Sacred), so it grouped nothing the tree didn't already group, and
-- there is no matching "Christian Music" genre. A song's Jewishness is its
-- community tag (Jewish, Ashkenazi, Chabad…). Sacred is the umbrella genre
-- for liturgical and devotional songs of every faith (Ben, 2026-11-24).
--
-- Production songs were already moved to Sacred before this ran; this also
-- covers any other database: a song left with no genre gets Sacred first.

insert into public.song_tags (song_id, tag_id, context)
select st.song_id, sacred.id, 'general'
from public.song_tags st
join public.tags jm on jm.id = st.tag_id and jm.type = 'genre' and jm.name = 'Jewish Music'
cross join (select id from public.tags where type = 'genre' and name = 'Sacred') sacred
where st.context = 'general'
  and not exists (
    select 1 from public.song_tags o join public.tags t on t.id = o.tag_id
    where o.song_id = st.song_id and t.type = 'genre' and t.id <> jm.id)
on conflict do nothing;

update public.profiles
set favorite_genres = array_remove(favorite_genres, 'Jewish Music')
where 'Jewish Music' = any(favorite_genres);

-- song_tags, jam_tags, tag_relations and tag_legacy_map rows go with it (on delete cascade).
delete from public.tags where type = 'genre' and name = 'Jewish Music';
