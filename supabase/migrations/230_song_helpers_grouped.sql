-- Faster song helpers (migration 228).
-- * song_years, song_tag_arrays and song_cards become plpgsql planned for
--   each call (force_custom_plan): a SQL function is planned without seeing
--   its array, guesses 10 songs, and picks nested loops that took 22 s for
--   1,000 songs, or scans whole tables with a linear `= any(array)`.
-- * Grouped aggregates in place of per-song subqueries.
-- * song_bylines drops SET search_path so it inlines into byline(s) and into
--   song_cards: a function with SET is never inlined, and one called inside
--   another is planned again on every row (byline(s) over all songs took
--   2.2 s). It names every object with its schema and runs as the caller, so
--   an unset search_path changes nothing.

create or replace function public.song_years(p_song_ids uuid[] default null)
returns table (song_id uuid, span int4range)
language plpgsql stable
set search_path to 'public'
set plan_cache_mode to 'force_custom_plan'
as $$
#variable_conflict use_column
begin
  return query
  with ids as (
    select s.id from public.songs s where p_song_ids is null
    union
    select unnest(p_song_ids)
  ),
  cand(song_id, r) as (
    select s.id, public.year_span(x.year, x.year_precision)
    from ids join public.songs s on s.id = ids.id join public.texts x on x.id = s.text_id
    union all
    select s.id, public.year_span(t.year, t.year_precision)
    from ids join public.songs s on s.id = ids.id join public.tunes t on t.id = s.tune_id
    union all
    select s.id, public.year_span(s.year_written, 'exact')
    from ids join public.songs s on s.id = ids.id
    union all
    select f.song_id, public.year_span(f.y, 'exact')
    from (
      select sra.song_id, min(sra.year) as y
      from ids join public.song_recording_artists sra on sra.song_id = ids.id
      group by sra.song_id
    ) f
  ),
  earliest as (
    select distinct on (c.song_id) c.song_id, c.r
    from cand c
    where c.r is not null
    order by c.song_id, lower(c.r), upper(c.r)
  )
  select s.id, e.r
  from ids
  join public.songs s on s.id = ids.id
  left join earliest e on e.song_id = s.id;
end;
$$;

create or replace function public.song_bylines(p_song_ids uuid[])
returns table (song_id uuid, byline text)
language sql stable
as $$
  with recursive ids as (
    select distinct unnest(p_song_ids) as id
  ),
  christian as (
    select id from public.tags where type = 'community' and name = 'Christian'
    union
    select r.tag_id from public.tag_relations r join christian c on r.related_tag_id = c.id where r.kind = 'parent'
  ),
  writers as (
    select w.song_id,
      bool_or(lower(p.name) = 'traditional') as traditional,
      string_agg(distinct p.name, ', ' order by p.name) filter (where lower(p.name) <> 'traditional') as named
    from (
      select sc.song_id, sc.person_id from ids join public.song_composers sc on sc.song_id = ids.id
      union
      select sl.song_id, sl.person_id from ids join public.song_lyricists sl on sl.song_id = ids.id
    ) w
    join public.people p on p.id = w.person_id
    group by w.song_id
  ),
  traditional_form as (
    select distinct st.song_id
    from ids join public.song_tags st on st.song_id = ids.id join public.tags t on t.id = st.tag_id
    where t.type = 'form'
      and t.name in ('Hymn', 'Nigun', 'Zemer', 'Piyyut', 'Psalm setting', 'Liturgical setting', 'Chant', 'Lined hymn', 'Carol')
  ),
  -- Where it comes from: a non-Christian community (Jewish), then a culture
  -- (the more specific one first: African American over American), then a
  -- Christian church community; music context first.
  origin as (
    select distinct on (st.song_id) st.song_id, t.name
    from ids join public.song_tags st on st.song_id = ids.id join public.tags t on t.id = st.tag_id
    where t.type in ('community', 'culture')
    order by st.song_id,
      case when t.type = 'community' and t.id not in (select id from christian) then 0
           when t.type = 'culture' then 1
           else 2 end,
      t.is_top_level, (st.context = 'music') desc, t.name
  )
  select s.id, case
    when coalesce(s.known_by_recording, not (coalesce(w.traditional, false) or f.song_id is not null))
      then coalesce(nullif(trim(s.display_artist), ''), w.named)
    else coalesce(w.named, 'Traditional' || coalesce(' · ' || o.name, ''))
  end
  from ids
  join public.songs s on s.id = ids.id
  left join writers w on w.song_id = s.id
  left join traditional_form f on f.song_id = s.id
  left join origin o on o.song_id = s.id;
$$;

create or replace function public.song_cards(p_song_ids uuid[])
returns table (
  song_id uuid, byline text, composers text[], cultures text[], productions text[],
  recording_artists jsonb, production_credits jsonb, youtube_id text, spotify_track_id text,
  card_identity jsonb, card jsonb
)
language plpgsql stable
set search_path to 'public'
set plan_cache_mode to 'force_custom_plan'
as $$
#variable_conflict use_column
begin
  return query
  with ids as (
    select distinct unnest(p_song_ids) as id
  ),
  writers as (
    select w.song_id, array_agg(distinct p.name order by p.name) as names
    from (
      select sc.song_id, sc.person_id from ids join public.song_composers sc on sc.song_id = ids.id
      union
      select sl.song_id, sl.person_id from ids join public.song_lyricists sl on sl.song_id = ids.id
    ) w
    join public.people p on p.id = w.person_id
    group by w.song_id
  ),
  shows as (
    select sp.song_id,
      array_agg(pr.name order by pr.name) as names,
      jsonb_agg(jsonb_build_object('name', pr.name, 'year', pr.year, 'slug', pr.slug) order by pr.year nulls last, pr.name) as credits
    from ids join public.song_productions sp on sp.song_id = ids.id join public.productions pr on pr.id = sp.production_id
    group by sp.song_id
  ),
  -- The video and track a card plays: the first recording that has one.
  recordings as (
    select ra.song_id,
      jsonb_agg(jsonb_build_object('name', a.name, 'year', ra.year) order by ra.position nulls last, a.name) as artists,
      (array_agg((regexp_match(ra.youtube_url, '(?:youtu\.be/|[?&]v=|/(?:embed|v|shorts)/)([a-zA-Z0-9_-]{11})'))[1]
         order by ra.position nulls last, ra.artist_id) filter (where ra.youtube_url is not null))[1] as youtube_id,
      (array_agg((regexp_match(ra.spotify_url, '/track/([a-zA-Z0-9]+)'))[1]
         order by ra.position nulls last, ra.artist_id) filter (where ra.spotify_url is not null))[1] as spotify_track_id
    from ids join public.song_recording_artists ra on ra.song_id = ids.id join public.artists a on a.id = ra.artist_id
    group by ra.song_id
  ),
  -- A text's main source on a card: quoted, then metrical, then paraphrase.
  sources as (
    select distinct on (ts.text_id) ts.text_id,
      jsonb_build_object('book', ts.book, 'chapter_start', ts.chapter_start, 'verse_start', ts.verse_start,
                         'chapter_end', ts.chapter_end, 'verse_end', ts.verse_end, 'citation', ts.citation,
                         'relation', ts.relation, 'corpus', ts.corpus) as source
    from public.text_sources ts
    where ts.relation <> 'inspired'
      and ts.text_id in (select s.text_id from ids join public.songs s on s.id = ids.id)
    order by ts.text_id, array_position(array['quoted', 'metrical', 'paraphrase'], ts.relation), ts.id
  ),
  cards as (
    select
      s.id as song_id,
      b.byline,
      coalesce(w.names, '{}') as composers,
      tg.cultures,
      coalesce(sh.names, '{}') as productions,
      coalesce(r.artists, '[]'::jsonb) as recording_artists,
      coalesce(sh.credits, '[]'::jsonb) as production_credits,
      coalesce(r.youtube_id, (regexp_match(s.youtube_url, '(?:youtu\.be/|[?&]v=|/(?:embed|v|shorts)/)([a-zA-Z0-9_-]{11})'))[1]) as youtube_id,
      r.spotify_track_id,
      jsonb_build_object(
        'tune', nullif(trim(tu.name), ''),
        'tune_slug', tu.slug,
        'text_slug', tx.slug,
        'source', src.source,
        'first_line', nullif(trim(s.first_line), '')
      ) as card_identity
    from ids
    join public.songs s on s.id = ids.id
    join public.song_bylines(p_song_ids) b on b.song_id = s.id
    join public.song_tag_arrays(p_song_ids) tg on tg.song_id = s.id
    left join writers w on w.song_id = s.id
    left join shows sh on sh.song_id = s.id
    left join recordings r on r.song_id = s.id
    left join public.tunes tu on tu.id = s.tune_id
    left join public.texts tx on tx.id = s.text_id
    left join sources src on src.text_id = s.text_id
  )
  select c.*, jsonb_build_object(
    'byline', c.byline, 'composers', c.composers, 'cultures', c.cultures,
    'recording_artists', c.recording_artists, 'card_identity', c.card_identity)
  from cards c;
end;
$$;

create or replace function public.song_tag_arrays(p_song_ids uuid[] default null)
returns table (song_id uuid, genres text[], languages text[], themes text[], cultures text[], forms text[], occasions text[], communities text[])
language plpgsql stable
set search_path to 'public'
set plan_cache_mode to 'force_custom_plan'
as $$
#variable_conflict use_column
begin
  return query
  with ids as (
    select s.id from public.songs s where p_song_ids is null
    union
    select unnest(p_song_ids)
  )
  select
    s.id,
    coalesce(g.genres, '{}'), coalesce(g.languages, '{}'), coalesce(g.themes, '{}'), coalesce(g.cultures, '{}'),
    coalesce(g.forms, '{}'), coalesce(g.occasions, '{}'), coalesce(g.communities, '{}')
  from ids
  join public.songs s on s.id = ids.id
  left join (
    select
      st.song_id,
      array_agg(distinct t.name order by t.name) filter (where t.type = 'genre') as genres,
      array_agg(distinct t.name order by t.name) filter (where t.type = 'language') as languages,
      array_agg(distinct t.name order by t.name) filter (where t.type = 'theme') as themes,
      array_agg(distinct t.name order by t.name) filter (where t.type = 'culture') as cultures,
      array_agg(distinct t.name order by t.name) filter (where t.type = 'form') as forms,
      array_agg(distinct t.name order by t.name) filter (where t.type = 'occasion') as occasions,
      array_agg(distinct t.name order by t.name) filter (where t.type = 'community') as communities
    from ids
    join public.song_tags st on st.song_id = ids.id
    join public.tags t on t.id = st.tag_id
    group by st.song_id
  ) g on g.song_id = s.id;
end;
$$;

create or replace function public.song_filter_meta(p_song_ids uuid[] default null)
returns table (song_id uuid, genres text[], languages text[], themes text[], cultures text[], vibe text, tonality text, meter text, year integer, year_max integer, forms text[], occasions text[], communities text[])
language sql stable
set search_path to 'public'
as $$
  select
    s.id, t.genres, t.languages, t.themes, t.cultures, s.vibe, s.tonality, s.meter,
    lower(y.span), upper(y.span) - 1, t.forms, t.occasions, t.communities
  from public.song_tag_arrays(p_song_ids) t
  join public.song_years(p_song_ids) y on y.song_id = t.song_id
  join public.songs s on s.id = t.song_id;
$$;

create or replace function public.browse_songs(
  p_genres text[] default null, p_languages text[] default null, p_themes text[] default null, p_cultures text[] default null,
  p_vibe text default null, p_tonality text default null, p_meter text default null,
  p_year_min integer default null, p_year_max integer default null, p_exclude_mine boolean default false,
  p_sort text default 'popularity', p_offset integer default 0, p_limit integer default 20,
  p_forms text[] default null, p_occasions text[] default null, p_communities text[] default null, p_song_ids uuid[] default null
)
returns table (
  song_id uuid, title text, slug text, display_artist text, composers text[], cultures text[], productions text[],
  genres text[], languages text[], themes text[], vibe text, tonality text, meter text, year integer, popularity bigint,
  youtube_id text, spotify_track_id text, recording_artists jsonb, production_credits jsonb, total_count bigint,
  forms text[], occasions text[], communities text[], byline text, card_identity jsonb, year_max integer
)
language sql stable security definer
set search_path to 'public'
as $$
  with meta as (
    select
      s.id, s.title, s.vibe, s.tonality, s.meter,
      t.genres, t.languages, t.themes, t.cultures, t.forms, t.occasions, t.communities,
      y.span,
      (select count(*) from public.user_songs us where us.song_id = s.id) as popularity
    from public.songs s
    join public.song_tag_arrays(p_song_ids) t on t.song_id = s.id
    join public.song_years(p_song_ids) y on y.song_id = s.id
  ),
  filtered as (
    select m.*
    from meta m
    where (p_genres      is null or m.genres      && p_genres)
      and (p_languages   is null or m.languages   && p_languages)
      and (p_themes      is null or m.themes      && p_themes)
      and (p_cultures    is null or m.cultures    && p_cultures)
      and (p_forms       is null or m.forms       && p_forms)
      and (p_occasions   is null or m.occasions   && p_occasions)
      and (p_communities is null or m.communities && p_communities)
      and (p_vibe      is null or m.vibe  = p_vibe)
      and (p_meter     is null or m.meter = p_meter)
      and (p_tonality  is null or p_tonality = any(regexp_split_to_array(coalesce(m.tonality, ''), ',\s*')))
      and ((p_year_min is null and p_year_max is null)
        or (m.span is not null
            and m.span && int4range(coalesce(p_year_min, -100000), coalesce(p_year_max, 100000), '[]')))
      and (not p_exclude_mine or not exists (
            select 1 from public.user_songs us
            where us.song_id = m.id and us.user_id = (select auth.uid())))
  ),
  page as (
    select f.*, count(*) over () as total_count
    from filtered f
    order by
      case when p_sort = 'title_asc'  then f.title end asc,
      case when p_sort = 'title_desc' then f.title end desc,
      case when p_sort not in ('title_asc', 'title_desc') then f.popularity end desc,
      f.title asc,
      f.id asc
    limit least(greatest(p_limit, 0), 200)
    offset greatest(p_offset, 0)
  )
  select
    pg.id, pg.title, s.slug, s.display_artist, c.composers, pg.cultures, c.productions,
    pg.genres, pg.languages, pg.themes, pg.vibe, pg.tonality, pg.meter, lower(pg.span), pg.popularity,
    c.youtube_id, c.spotify_track_id, c.recording_artists, c.production_credits, pg.total_count,
    pg.forms, pg.occasions, pg.communities, c.byline, c.card_identity, upper(pg.span) - 1
  from page pg
  join public.songs s on s.id = pg.id
  join public.song_cards((select array_agg(id) from page)) c on c.song_id = pg.id
  order by
    case when p_sort = 'title_asc'  then pg.title end asc,
    case when p_sort = 'title_desc' then pg.title end desc,
    case when p_sort not in ('title_asc', 'title_desc') then pg.popularity end desc,
    pg.title asc,
    pg.id asc;
$$;
