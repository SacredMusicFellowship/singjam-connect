-- Song Library search also offers the browse pages whose names match: tunes,
-- texts, songwriters, recording artists and shows, each with its song count.
-- Only entries with songs. A text or tune whose one song has the same title is
-- left out, since that song's card already answers the search.
--
-- key is the entity's slug, what browsePath and loadBrowseEntity take.
-- Rank: whole-name match, then a word starting with the query, then anywhere;
-- then most songs, name, kind and key (unique within a kind) as tiebreakers.

create or replace function public.search_browse_entities(q text, limit_n integer default 5)
returns table (kind text, key text, name text, song_count integer)
language plpgsql stable security definer
set search_path to 'public'
set plan_cache_mode to 'force_custom_plan'
as $$
#variable_conflict use_column
declare
  nq text := nullif(btrim(public.search_normalize(q)), '');
begin
  if nq is null then return; end if;
  return query
  with people_m as (
    select p.id, coalesce(p.slug, p.name) as key, p.name, n
    from public.people p, public.search_normalize(p.name) n
    where n like '%' || nq || '%' and p.name <> 'Traditional'
  ),
  artists_m as (
    select a.id, coalesce(a.slug, a.name) as key, a.name, n
    from public.artists a, public.search_normalize(a.name) n
    where n like '%' || nq || '%'
  ),
  shows_m as (
    select pr.id, pr.slug as key, pr.name, n
    from public.productions pr, public.search_normalize(pr.name) n
    where n like '%' || nq || '%'
  ),
  tunes_m as (
    select tu.id, tu.slug as key, tu.name, n
    from public.tunes tu, public.search_normalize(tu.name) n
    where tu.name is not null and n like '%' || nq || '%'
  ),
  -- A text matches on its title or any other title it goes by.
  texts_m as (
    select tx.id, tx.slug as key, tx.title as name, public.search_normalize(tx.title) as title_n, min(m.rank) as rank
    from public.texts tx
    cross join lateral (
      select tx.title union all select tt.title from public.text_titles tt where tt.text_id = tx.id
    ) t(title)
    cross join lateral (select public.search_normalize(t.title) as n) nn
    cross join lateral (select case when nn.n = nq then 0 when nn.n like nq || '%' or nn.n like '% ' || nq || '%' then 1 else 2 end as rank) m
    where nn.n like '%' || nq || '%'
    group by tx.id, tx.slug, tx.title
  ),
  candidates as (
    select 'person'::text as kind, m.key, m.name, m.n, null::int as rank, c.song_count, null::text as only_title
    from people_m m
    join (
      select w.person_id, count(distinct w.song_id)::int as song_count
      from (select sc.person_id, sc.song_id from public.song_composers sc
            union all select sl.person_id, sl.song_id from public.song_lyricists sl) w
      where w.person_id in (select id from people_m)
      group by w.person_id
    ) c on c.person_id = m.id
    union all
    select 'artist', m.key, m.name, m.n, null, c.song_count, null
    from artists_m m
    join (
      select sra.artist_id, count(distinct sra.song_id)::int as song_count
      from public.song_recording_artists sra
      where sra.artist_id in (select id from artists_m)
      group by sra.artist_id
    ) c on c.artist_id = m.id
    union all
    select 'show', m.key, m.name, m.n, null, c.song_count, null
    from shows_m m
    join (
      select sp.production_id, count(distinct sp.song_id)::int as song_count
      from public.song_productions sp
      where sp.production_id in (select id from shows_m)
      group by sp.production_id
    ) c on c.production_id = m.id
    union all
    select 'tune', m.key, m.name, m.n, null, c.song_count, c.only_title
    from tunes_m m
    join (
      select s.tune_id, count(*)::int as song_count, public.search_normalize(min(s.title)) as only_title
      from public.songs s
      where s.tune_id in (select id from tunes_m)
      group by s.tune_id
    ) c on c.tune_id = m.id
    union all
    select 'text', m.key, m.name, m.title_n, m.rank, c.song_count, c.only_title
    from texts_m m
    join (
      select s.text_id, count(*)::int as song_count, public.search_normalize(min(s.title)) as only_title
      from public.songs s
      where s.text_id in (select id from texts_m)
      group by s.text_id
    ) c on c.text_id = m.id
  )
  select c.kind, c.key, c.name, c.song_count
  from candidates c
  cross join lateral (
    select coalesce(c.rank, case when c.n = nq then 0 when c.n like nq || '%' or c.n like '% ' || nq || '%' then 1 else 2 end) as rank
  ) r
  where not (c.song_count = 1 and c.only_title = c.n)
  order by r.rank, c.song_count desc, c.name, c.kind, c.key
  limit least(greatest(limit_n, 0), 20);
end;
$$;

revoke execute on function public.search_browse_entities(text, integer) from public;
grant execute on function public.search_browse_entities(text, integer) to anon, authenticated, service_role;
