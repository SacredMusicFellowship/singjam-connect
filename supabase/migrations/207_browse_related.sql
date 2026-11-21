-- Migration 207: what's most common among a browse page's songs, so every page
-- links onward: the top tags of each type, songwriters, recording artists and
-- shows across the given songs, each with how many of them it covers.
create or replace function public.browse_related(p_song_ids uuid[], p_limit int default 8)
returns table (kind text, type text, name text, slug text, songs int)
language sql
stable
set search_path = public
as $$
  with ranked as (
    select 'tag'::text as kind, t.type, t.name, t.slug, count(distinct st.song_id)::int as songs
    from public.song_tags st join public.tags t on t.id = st.tag_id
    where st.song_id = any(p_song_ids)
    group by t.type, t.name, t.slug
    union all
    select 'person', null, p.name, p.slug, count(distinct c.song_id)::int
    from (
      select song_id, person_id from public.song_composers where song_id = any(p_song_ids)
      union
      select song_id, person_id from public.song_lyricists where song_id = any(p_song_ids)
    ) c join public.people p on p.id = c.person_id
    where lower(p.name) <> 'traditional'
    group by p.name, p.slug
    union all
    select 'artist', null, a.name, a.slug, count(distinct ra.song_id)::int
    from public.song_recording_artists ra join public.artists a on a.id = ra.artist_id
    where ra.song_id = any(p_song_ids)
    group by a.name, a.slug
    union all
    select 'show', null, pr.name, pr.slug, count(distinct sp.song_id)::int
    from public.song_productions sp join public.productions pr on pr.id = sp.production_id
    where sp.song_id = any(p_song_ids)
    group by pr.name, pr.slug
  ),
  numbered as (
    select r.*, row_number() over (partition by r.kind, r.type order by r.songs desc, r.name) as n from ranked r
  )
  select kind, type, name, slug, songs from numbered where n <= greatest(p_limit, 1)
  order by kind, type, songs desc, name;
$$;
grant execute on function public.browse_related(uuid[], int) to anon, authenticated, service_role;
