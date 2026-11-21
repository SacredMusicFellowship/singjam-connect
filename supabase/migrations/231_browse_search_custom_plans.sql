-- browse_songs and search_songs are planned for each call (plpgsql,
-- force_custom_plan): as SQL functions they got one generic plan, and
-- browse_songs ran 320 ms where the same query planned with its arguments
-- runs 75 ms. search_songs matched with one join of every writer, alternate
-- title and show per song, joined to people with an OR that can't hash
-- (0.5 s); it now matches each source once. Same songs match, same results.

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
language plpgsql stable security definer
set search_path to 'public'
set plan_cache_mode to 'force_custom_plan'
as $$
#variable_conflict use_column
begin
  return query
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
end;
$$;

create or replace function public.search_songs(q text, limit_n integer default 50)
returns table (song_id uuid, title text, display_artist text, first_line text, aka text[], composers text[], cultures text[], productions text[], genres text[], languages text[], themes text[], vibe text, tonality text, meter text, year integer, slug text, score real, popularity bigint, youtube_id text, spotify_track_id text, recording_artists jsonb, production_credits jsonb, forms text[], occasions text[], communities text[], byline text, card_identity jsonb)
language plpgsql stable security definer
set search_path to 'public'
set plan_cache_mode to 'force_custom_plan'
as $$
#variable_conflict use_column
begin
  return query
  with pat as (
    select '%' || q || '%' as p, '%' || regexp_replace(lower(q), '[^a-z0-9 ]', '', 'g') || '%' as np, plainto_tsquery('english', q) as tsq
  ),
  -- Each source matched once (correlated per song, the planner scanned
  -- every show with a regex for each song).
  matched as (
    select s.id from public.songs s, pat
    where s.title ilike pat.p or regexp_replace(lower(s.title), '[^a-z0-9 ]', '', 'g') ilike pat.np
      or s.first_line ilike pat.p or regexp_replace(lower(coalesce(s.first_line,'')), '[^a-z0-9 ]', '', 'g') ilike pat.np
      or s.hook ilike pat.p or regexp_replace(lower(coalesce(s.hook,'')), '[^a-z0-9 ]', '', 'g') ilike pat.np
      or s.notes ilike pat.p or regexp_replace(lower(coalesce(s.notes,'')), '[^a-z0-9 ]', '', 'g') ilike pat.np
      or s.display_artist ilike pat.p or regexp_replace(lower(coalesce(s.display_artist,'')), '[^a-z0-9 ]', '', 'g') ilike pat.np
      or to_tsvector('english',
           coalesce(s.title, '') || ' ' || coalesce(s.first_line, '') || ' ' ||
           coalesce(s.display_artist, '') || ' ' || coalesce(s.notes, '')
         ) @@ pat.tsq
    union
    select sat.song_id from public.song_alternate_titles sat, pat
    where sat.title ilike pat.p or regexp_replace(lower(sat.title), '[^a-z0-9 ]', '', 'g') ilike pat.np
    union
    select w.song_id
    from (select song_id, person_id from public.song_composers union all select song_id, person_id from public.song_lyricists) w
    join public.people p on p.id = w.person_id, pat
    where p.name ilike pat.p or regexp_replace(lower(p.name), '[^a-z0-9 ]', '', 'g') ilike pat.np
    union
    select sp.song_id from public.song_productions sp join public.productions pr on pr.id = sp.production_id, pat
    where pr.name ilike pat.p or regexp_replace(lower(pr.name), '[^a-z0-9 ]', '', 'g') ilike pat.np
    union
    select s.id from public.songs s join public.text_titles tt on tt.text_id = s.text_id, pat
    where tt.title ilike pat.p or regexp_replace(lower(tt.title), '[^a-z0-9 ]', '', 'g') ilike pat.np
    union
    select s.id from public.songs s join public.tunes tu on tu.id = s.tune_id, pat
    where tu.name ilike pat.p or regexp_replace(lower(coalesce(tu.name,'')), '[^a-z0-9 ]', '', 'g') ilike pat.np
  ),
  ranked as (
    select
      s.id,
      ts_rank(
        to_tsvector('english',
          coalesce(s.title, '') || ' ' ||
          coalesce(s.first_line, '') || ' ' ||
          coalesce(s.display_artist, '') || ' ' ||
          coalesce(s.notes, '') || ' ' ||
          coalesce((select string_agg(distinct p.name, ' ') from public.people p
                    where p.id in (select person_id from public.song_composers where song_id = s.id
                                   union select person_id from public.song_lyricists where song_id = s.id)), '') || ' ' ||
          coalesce((select string_agg(distinct pr.name, ' ') from public.song_productions sp join public.productions pr on pr.id = sp.production_id
                    where sp.song_id = s.id), '')
        ),
        (select tsq from pat)
      ) as score
    from matched m
    join public.songs s on s.id = m.id
  ),
  top as (
    select r.id, r.score, s.title
    from ranked r join public.songs s on s.id = r.id
    order by r.score desc, s.title, r.id
    limit least(greatest(limit_n, 0), 100)
  )
  select
    s.id, s.title, s.display_artist, s.first_line,
    coalesce((select array_agg(distinct sat.title) from public.song_alternate_titles sat where sat.song_id = s.id), '{}'::text[])
      || coalesce((select array_agg(tt.title order by tt.title) from public.text_titles tt where tt.text_id = s.text_id), '{}'::text[]),
    c.composers, t.cultures, c.productions, t.genres, t.languages, t.themes,
    s.vibe, s.tonality, s.meter, lower(y.span), s.slug, tp.score,
    (select count(*) from public.user_songs us where us.song_id = s.id),
    c.youtube_id, c.spotify_track_id, c.recording_artists, c.production_credits,
    t.forms, t.occasions, t.communities, c.byline, c.card_identity
  from top tp
  join public.songs s on s.id = tp.id
  join public.song_cards((select array_agg(id) from top)) c on c.song_id = s.id
  join public.song_tag_arrays((select array_agg(id) from top)) t on t.song_id = s.id
  join public.song_years((select array_agg(id) from top)) y on y.song_id = s.id
  order by tp.score desc, tp.title, tp.id;
end;
$$;
