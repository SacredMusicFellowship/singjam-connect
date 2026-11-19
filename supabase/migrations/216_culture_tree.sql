-- Migration 216: how SingJam groups American traditions, decided 2026-11-08
-- after checking how the Library of Congress, Black church hymnals, the
-- Smithsonian NMAI, the National Park Service (Gullah Geechee corridor) and
-- Hawaiian studies sources name them.
--
-- * Traditions that grew up within American music sit under American, so the
--   American page and filter include them, and each keeps its own page:
--   African American (and Gullah Geechee under it), Appalachian, Cajun, Tex-Mex.
-- * Indigenous peoples and Puerto Rico are related to American, not placed
--   under it: First Nations/Native American (a specific nation's own tag is
--   preferred when a song names one), Hawaiian, Puerto Rican.
-- * A culture tag names a song's tradition, never a performer's ethnicity.
-- * byline(): "Traditional · <origin>" prefers a culture over a Christian church
--   community (a spiritual is "Traditional · African American", as hymnals and
--   the Library of Congress credit it) but still prefers other communities
--   ("Traditional · Jewish" for Hinei Ma Tov).

-- A fresh replay (local, e2e) runs every migration in one session; start without the pg_temp
-- helpers earlier migrations defined under the same names.
discard temp;

create function pg_temp.t(p_type text, p_name text, p_aliases text[] default '{}')
returns uuid language plpgsql as $$
declare v uuid;
begin
  select id into v from public.tags where type = p_type and lower(name) = lower(p_name);
  if v is null then
    insert into public.tags (type, name, slug, is_top_level, aliases) values (p_type, p_name, public.tag_slug(p_name), false, p_aliases) returning id into v;
  else
    update public.tags set aliases = (select array(select distinct unnest(aliases || p_aliases))) where id = v;
  end if;
  return v;
end $$;

create function pg_temp.link(p_type text, p_a text, p_b text, p_kind text)
returns void language sql as $$
  insert into public.tag_relations (tag_id, related_tag_id, kind)
  values (pg_temp.t(p_type, p_a), pg_temp.t(p_type, p_b), p_kind)
  on conflict do nothing;
$$;

-- Under American
select pg_temp.link('culture', 'African American', 'American', 'parent');
select pg_temp.t('culture', 'Gullah Geechee', array['Gullah', 'Geechee', 'Gullah/Geechee']);
select pg_temp.link('culture', 'Gullah Geechee', 'African American', 'parent');
select pg_temp.t('culture', 'Appalachian', array['Old-time', 'Southern Appalachian']);
select pg_temp.link('culture', 'Appalachian', 'American', 'parent');
select pg_temp.link('culture', 'Cajun', 'American', 'parent');
select pg_temp.link('culture', 'Tex-Mex', 'American', 'parent');
update public.tags set is_top_level = false
where type = 'culture' and name in ('African American', 'Gullah Geechee', 'Appalachian', 'Cajun', 'Tex-Mex');

-- Related to American, not under it
select pg_temp.t('culture', 'First Nations/Native American', array['American Indian', 'Indigenous American', 'Native American', 'First Nations']);
select pg_temp.link('culture', 'First Nations/Native American', 'American', 'related');
select pg_temp.link('culture', 'First Nations/Native American', 'Canadian', 'related');
select pg_temp.t('culture', 'Hawaiian', array['Native Hawaiian', 'Kanaka Maoli']);
select pg_temp.link('culture', 'Hawaiian', 'American', 'related');
select pg_temp.link('culture', 'Puerto Rican', 'American', 'related');
select pg_temp.link('culture', 'Puerto Rican', 'Latin American', 'related');

-- The worshipping community of the historically Black churches
select pg_temp.t('community', 'Black Church (US)', array['Black church', 'African American church']);

create or replace function public.byline(s public.songs)
returns text
language sql
stable
set search_path = public
as $$
  with recursive christian as (
    select id from public.tags where type = 'community' and name = 'Christian'
    union
    select r.tag_id from public.tag_relations r join christian c on r.related_tag_id = c.id where r.kind = 'parent'
  ),
  writers as (
    select distinct p.name
    from (
      select person_id from public.song_composers where song_id = s.id
      union
      select person_id from public.song_lyricists where song_id = s.id
    ) c
    join public.people p on p.id = c.person_id
  ),
  facts as (
    select
      exists (select 1 from writers where lower(name) = 'traditional') as traditional,
      exists (
        select 1 from public.song_tags st join public.tags t on t.id = st.tag_id
        where st.song_id = s.id and t.type = 'form'
          and t.name in ('Hymn', 'Nigun', 'Zemer', 'Piyyut', 'Psalm setting', 'Liturgical setting', 'Chant', 'Lined hymn', 'Carol')
      ) as traditional_form,
      (select string_agg(name, ', ' order by name) from writers where lower(name) <> 'traditional') as named,
      -- Where it comes from: a non-Christian community (Jewish), then a
      -- culture (the more specific one first: African American over
      -- American), then a Christian church community; music context first.
      (select t.name from public.song_tags st join public.tags t on t.id = st.tag_id
        where st.song_id = s.id and t.type in ('community', 'culture')
        order by
          case when t.type = 'community' and t.id not in (select id from christian) then 0
               when t.type = 'culture' then 1
               else 2 end,
          t.is_top_level, (st.context = 'music') desc, t.name
        limit 1) as origin
  )
  select case
    when coalesce(s.known_by_recording, not (f.traditional or f.traditional_form)) then nullif(trim(s.display_artist), '')
    else coalesce(f.named, 'Traditional' || coalesce(' · ' || f.origin, ''))
  end
  from facts f;
$$;
grant execute on function public.byline(public.songs) to anon, authenticated, service_role;

-- Data: spirituals already in the catalogue carry the tradition's name
-- (they were tagged only "American"); "Kumbaya" too (Library of Congress:
-- almost certainly from African Americans in the Southeast); and Leonard
-- Cohen's "Hallelujah" was mistagged with the Spiritual genre.
insert into public.song_tags (song_id, tag_id, context)
select s.id, (select id from public.tags where type = 'culture' and name = 'African American'), 'general'
from public.songs s
where (exists (select 1 from public.song_tags st join public.tags t on t.id = st.tag_id
               where st.song_id = s.id and t.type = 'genre' and t.name = 'Spiritual')
       or s.title = 'Kumbaya')
  and s.title <> 'Hallelujah'
on conflict do nothing;

delete from public.song_tags st
using public.tags t, public.songs s
where t.id = st.tag_id and s.id = st.song_id
  and t.type = 'genre' and t.name = 'Spiritual'
  and s.title = 'Hallelujah' and s.display_artist ilike '%Leonard Cohen%';
