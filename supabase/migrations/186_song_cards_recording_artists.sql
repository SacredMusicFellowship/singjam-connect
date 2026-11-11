-- Migration 186: song cards list each recording artist with its own recording
-- year ("The Beatles (1965), Joe Cocker (1969)"). The cards' `year` column is
-- least(year_written, earliest recording), which is wrong next to an artist,
-- so browse_songs, search_songs and suggest_songs_for_user gain
-- `recording_artists`: [{name, year}] in position order. Bodies are otherwise
-- identical to 140 (browse/search) and 112 (suggest). Adding a column changes
-- the return type, so each function is dropped and recreated with its grants.

drop function if exists public.browse_songs(text[], text[], text[], text[], text, text, text, int, int, boolean, text, int, int);
drop function if exists public.search_songs(text, int);
drop function if exists public.suggest_songs_for_user(uuid, int, int);

create or replace function public.browse_songs(
  p_genres       text[] default null,
  p_languages    text[] default null,
  p_themes       text[] default null,
  p_cultures     text[] default null,
  p_vibe         text default null,
  p_tonality     text default null,
  p_meter        text default null,
  p_year_min     int default null,
  p_year_max     int default null,
  p_exclude_mine boolean default false,
  p_sort         text default 'popularity',
  p_offset       int default 0,
  p_limit        int default 20
)
returns table (
  song_id          uuid,
  title            text,
  slug             text,
  display_artist   text,
  composers        text[],
  cultures         text[],
  productions      text[],
  genres           text[],
  languages        text[],
  themes           text[],
  vibe             text,
  tonality         text,
  meter            text,
  year             int,
  popularity       bigint,
  youtube_id       text,
  spotify_track_id text,
  recording_artists jsonb,
  total_count      bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with meta as (
    select
      s.id,
      s.title,
      s.vibe,
      s.tonality,
      s.meter,
      coalesce((select array_agg(g.name) from public.song_genres sg join public.genres g on g.id = sg.genre_id where sg.song_id = s.id), '{}') as genres,
      coalesce((select array_agg(l.name) from public.song_languages sl join public.languages l on l.id = sl.language_id where sl.song_id = s.id), '{}') as languages,
      coalesce((select array_agg(t.name) from public.song_themes st join public.themes t on t.id = st.theme_id where st.song_id = s.id), '{}') as themes,
      coalesce((select array_agg(c.name) from public.song_cultures scu join public.cultures c on c.id = scu.culture_id where scu.song_id = s.id), '{}') as cultures,
      least(s.year_written, (select min(sra.year) from public.song_recording_artists sra where sra.song_id = s.id)) as year,
      (select count(*) from public.user_songs us where us.song_id = s.id) as popularity
    from public.songs s
  ),
  filtered as (
    select m.*
    from meta m
    where (p_genres    is null or m.genres    && p_genres)
      and (p_languages is null or m.languages && p_languages)
      and (p_themes    is null or m.themes    && p_themes)
      and (p_cultures  is null or m.cultures  && p_cultures)
      and (p_vibe      is null or m.vibe  = p_vibe)
      and (p_meter     is null or m.meter = p_meter)
      and (p_tonality  is null or p_tonality = any(regexp_split_to_array(coalesce(m.tonality, ''), ',\s*')))
      and ((p_year_min is null and p_year_max is null)
        or (m.year is not null
            and (p_year_min is null or m.year >= p_year_min)
            and (p_year_max is null or m.year <= p_year_max)))
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
    s.id as song_id,
    s.title,
    s.slug,
    s.display_artist,
    coalesce((
      select array_agg(name order by name) from (
        select p.name from public.song_composers sc join public.people p on p.id = sc.person_id where sc.song_id = s.id
        union
        select p.name from public.song_lyricists sl join public.people p on p.id = sl.person_id where sl.song_id = s.id
      ) names
    ), '{}') as composers,
    pg.cultures,
    coalesce((select array_agg(pr.name) from public.song_productions sp join public.productions pr on pr.id = sp.production_id where sp.song_id = s.id), '{}') as productions,
    pg.genres,
    pg.languages,
    pg.themes,
    s.vibe,
    s.tonality,
    s.meter,
    pg.year,
    pg.popularity,
    coalesce(
      (select (regexp_match(sra.youtube_url, '(?:youtu\.be/|[?&]v=|/(?:embed|v|shorts)/)([a-zA-Z0-9_-]{11})'))[1]
       from public.song_recording_artists sra
       where sra.song_id = s.id and sra.youtube_url is not null
       order by sra.position nulls last limit 1),
      (regexp_match(s.youtube_url, '(?:youtu\.be/|[?&]v=|/(?:embed|v|shorts)/)([a-zA-Z0-9_-]{11})'))[1]
    ) as youtube_id,
    (select (regexp_match(sra.spotify_url, '/track/([a-zA-Z0-9]+)'))[1]
     from public.song_recording_artists sra
     where sra.song_id = s.id and sra.spotify_url is not null
     order by sra.position nulls last limit 1) as spotify_track_id,
    (select coalesce(jsonb_agg(jsonb_build_object('name', a.name, 'year', ra.year) order by ra.position nulls last, a.name), '[]'::jsonb)
     from public.song_recording_artists ra join public.artists a on a.id = ra.artist_id
     where ra.song_id = s.id) as recording_artists,
    pg.total_count
  from page pg
  join public.songs s on s.id = pg.id
  order by
    case when p_sort = 'title_asc'  then pg.title end asc,
    case when p_sort = 'title_desc' then pg.title end desc,
    case when p_sort not in ('title_asc', 'title_desc') then pg.popularity end desc,
    pg.title asc,
    pg.id asc;
$$;

revoke execute on function public.browse_songs(text[], text[], text[], text[], text, text, text, int, int, boolean, text, int, int) from public;
grant execute on function public.browse_songs(text[], text[], text[], text[], text, text, text, int, int, boolean, text, int, int) to anon, authenticated, service_role;

create or replace function public.search_songs(q text, limit_n int default 50)
returns table (
  song_id          uuid,
  title            text,
  display_artist   text,
  first_line       text,
  aka              text[],
  composers        text[],
  cultures         text[],
  productions      text[],
  genres           text[],
  languages        text[],
  themes           text[],
  vibe             text,
  tonality         text,
  meter            text,
  year             int,
  slug             text,
  score            float4,
  popularity       bigint,
  youtube_id       text,
  spotify_track_id text,
  recording_artists jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with normalized as (
    select regexp_replace(lower(q), '[^a-z0-9 ]', '', 'g') as nq
  ),
  matched as (
    select distinct s.id
    from public.songs s
    cross join normalized
    left join public.song_alternate_titles sat on sat.song_id = s.id
    left join public.song_composers sc on sc.song_id = s.id
    left join public.song_lyricists sl on sl.song_id = s.id
    left join public.people p on p.id = sc.person_id or p.id = sl.person_id
    left join public.song_productions sp on sp.song_id = s.id
    left join public.productions pr on pr.id = sp.production_id
    where
      s.title             ilike '%' || q || '%'
      or regexp_replace(lower(s.title), '[^a-z0-9 ]', '', 'g')                    ilike '%' || normalized.nq || '%'
      or s.first_line     ilike '%' || q || '%'
      or regexp_replace(lower(coalesce(s.first_line,'')), '[^a-z0-9 ]', '', 'g') ilike '%' || normalized.nq || '%'
      or s.hook           ilike '%' || q || '%'
      or regexp_replace(lower(coalesce(s.hook,'')), '[^a-z0-9 ]', '', 'g')       ilike '%' || normalized.nq || '%'
      or s.notes          ilike '%' || q || '%'
      or regexp_replace(lower(coalesce(s.notes,'')), '[^a-z0-9 ]', '', 'g')      ilike '%' || normalized.nq || '%'
      or s.display_artist ilike '%' || q || '%'
      or regexp_replace(lower(coalesce(s.display_artist,'')), '[^a-z0-9 ]', '', 'g') ilike '%' || normalized.nq || '%'
      or sat.title        ilike '%' || q || '%'
      or regexp_replace(lower(coalesce(sat.title,'')), '[^a-z0-9 ]', '', 'g')    ilike '%' || normalized.nq || '%'
      or p.name           ilike '%' || q || '%'
      or regexp_replace(lower(coalesce(p.name,'')), '[^a-z0-9 ]', '', 'g')       ilike '%' || normalized.nq || '%'
      or pr.name          ilike '%' || q || '%'
      or regexp_replace(lower(coalesce(pr.name,'')), '[^a-z0-9 ]', '', 'g')      ilike '%' || normalized.nq || '%'
      or to_tsvector('english',
           coalesce(s.title, '') || ' ' ||
           coalesce(s.first_line, '') || ' ' ||
           coalesce(s.display_artist, '') || ' ' ||
           coalesce(s.notes, '')
         ) @@ plainto_tsquery('english', q)
  ),
  media as (
    select distinct on (song_id)
      song_id,
      youtube_url,
      spotify_url
    from public.song_recording_artists
    order by song_id, position nulls last
  )
  select
    s.id             as song_id,
    s.title,
    s.display_artist,
    s.first_line,
    coalesce(
      array_agg(distinct sat.title) filter (where sat.title is not null),
      '{}'::text[]
    )                as aka,
    coalesce(
      array_agg(distinct p.name) filter (where p.name is not null),
      '{}'::text[]
    )                as composers,
    coalesce(
      array_agg(distinct c.name) filter (where c.name is not null),
      '{}'::text[]
    )                as cultures,
    coalesce(
      array_agg(distinct pr.name) filter (where pr.name is not null),
      '{}'::text[]
    )                as productions,
    coalesce(
      array_agg(distinct g.name) filter (where g.name is not null),
      '{}'::text[]
    )                as genres,
    coalesce(
      array_agg(distinct l.name) filter (where l.name is not null),
      '{}'::text[]
    )                as languages,
    coalesce(
      array_agg(distinct t.name) filter (where t.name is not null),
      '{}'::text[]
    )                as themes,
    s.vibe,
    s.tonality,
    s.meter,
    least(
      s.year_written,
      min(sra.year)
    )                as year,
    s.slug,
    ts_rank(
      to_tsvector('english',
        coalesce(s.title, '') || ' ' ||
        coalesce(s.first_line, '') || ' ' ||
        coalesce(s.display_artist, '') || ' ' ||
        coalesce(s.notes, '') || ' ' ||
        coalesce(string_agg(distinct p.name, ' '), '') || ' ' ||
        coalesce(string_agg(distinct pr.name, ' '), '')
      ),
      plainto_tsquery('english', q)
    )                as score,
    (select count(*) from public.user_songs us where us.song_id = s.id) as popularity,
    (regexp_match(
      coalesce(med.youtube_url, s.youtube_url),
      '(?:youtu\.be/|[?&]v=|/(?:embed|v|shorts)/)([a-zA-Z0-9_-]{11})'
    ))[1]            as youtube_id,
    (regexp_match(
      med.spotify_url,
      '/track/([a-zA-Z0-9]+)'
    ))[1]            as spotify_track_id,
    (select coalesce(jsonb_agg(jsonb_build_object('name', a.name, 'year', ra.year) order by ra.position nulls last, a.name), '[]'::jsonb)
     from public.song_recording_artists ra join public.artists a on a.id = ra.artist_id
     where ra.song_id = s.id) as recording_artists
  from matched m
  join public.songs s on s.id = m.id
  left join public.song_alternate_titles sat on sat.song_id = s.id
  left join public.song_composers sc on sc.song_id = s.id
  left join public.song_lyricists sl on sl.song_id = s.id
  left join public.people p on p.id = sc.person_id or p.id = sl.person_id
  left join public.song_cultures scu on scu.song_id = s.id
  left join public.cultures c on c.id = scu.culture_id
  left join public.song_recording_artists sra on sra.song_id = s.id
  left join public.song_productions sp on sp.song_id = s.id
  left join public.productions pr on pr.id = sp.production_id
  left join public.song_genres sg on sg.song_id = s.id
  left join public.genres g on g.id = sg.genre_id
  left join public.song_languages sl2 on sl2.song_id = s.id
  left join public.languages l on l.id = sl2.language_id
  left join public.song_themes st on st.song_id = s.id
  left join public.themes t on t.id = st.theme_id
  left join media med on med.song_id = s.id
  group by s.id, med.youtube_url, med.spotify_url
  order by score desc, s.title
  limit least(greatest(limit_n, 0), 100);
$$;

revoke execute on function public.search_songs(text, int) from public;
grant execute on function public.search_songs(text, int) to anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.suggest_songs_for_user(
  p_user_id uuid,
  p_limit   int DEFAULT 20,
  p_offset  int DEFAULT 0
)
RETURNS TABLE (
  song_id          uuid,
  title            text,
  display_artist   text,
  first_line       text,
  slug             text,
  composers        text[],
  cultures         text[],
  productions      text[],
  genres           text[],
  languages        text[],
  year             int,
  popularity       bigint,
  youtube_id       text,
  spotify_track_id text,
  recording_artists jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH user_genres AS (
    SELECT DISTINCT sg.genre_id
    FROM user_songs us
    JOIN song_genres sg ON sg.song_id = us.song_id
    WHERE us.user_id = p_user_id
  ),
  user_cultures AS (
    SELECT DISTINCT sc.culture_id
    FROM user_songs us
    JOIN song_cultures sc ON sc.song_id = us.song_id
    WHERE us.user_id = p_user_id
  ),
  popularity AS (
    SELECT song_id, COUNT(*) AS user_count
    FROM user_songs
    GROUP BY song_id
  ),
  affinity AS (
    SELECT
      s.id AS song_id,
      COUNT(DISTINCT ug.genre_id) + COUNT(DISTINCT uc.culture_id) AS score
    FROM songs s
    LEFT JOIN song_genres sgen    ON sgen.song_id    = s.id
    LEFT JOIN user_genres ug      ON ug.genre_id     = sgen.genre_id
    LEFT JOIN song_cultures scu   ON scu.song_id     = s.id
    LEFT JOIN user_cultures uc    ON uc.culture_id   = scu.culture_id
    WHERE s.id NOT IN (
      SELECT song_id FROM user_songs WHERE user_id = p_user_id
    )
    GROUP BY s.id
  ),
  scored AS (
    SELECT
      a.song_id,
      COALESCE(p.user_count, 0) AS pop,
      a.score * 3 + COALESCE(p.user_count, 0) AS total
    FROM affinity a
    LEFT JOIN popularity p ON p.song_id = a.song_id
    WHERE COALESCE(p.user_count, 0) > 0
  ),
  -- Best (lowest-position) recording artist with a media URL per song
  media AS (
    SELECT DISTINCT ON (song_id)
      song_id,
      youtube_url,
      spotify_url
    FROM song_recording_artists
    ORDER BY song_id, position NULLS LAST
  )
  SELECT
    s.id,
    s.title,
    s.display_artist,
    s.first_line,
    s.slug,
    COALESCE(array_agg(DISTINCT pe.name)  FILTER (WHERE pe.name  IS NOT NULL), '{}'::text[]) AS composers,
    COALESCE(array_agg(DISTINCT c.name)   FILTER (WHERE c.name   IS NOT NULL), '{}'::text[]) AS cultures,
    COALESCE(array_agg(DISTINCT pr.name)  FILTER (WHERE pr.name  IS NOT NULL), '{}'::text[]) AS productions,
    COALESCE(array_agg(DISTINCT g.name)   FILTER (WHERE g.name   IS NOT NULL), '{}'::text[]) AS genres,
    COALESCE(array_agg(DISTINCT l.name)   FILTER (WHERE l.name   IS NOT NULL), '{}'::text[]) AS languages,
    LEAST(s.year_written, MIN(sra.year)) AS year,
    scr.pop AS popularity,
    -- Extract YouTube video ID from recording artist URL, fall back to songs.youtube_url
    (regexp_match(
      COALESCE(med.youtube_url, s.youtube_url),
      '(?:youtu\.be/|[?&]v=|/(?:embed|v|shorts)/)([a-zA-Z0-9_-]{11})'
    ))[1] AS youtube_id,
    -- Extract Spotify track ID
    (regexp_match(med.spotify_url, '/track/([a-zA-Z0-9]+)'))[1] AS spotify_track_id,
    (select coalesce(jsonb_agg(jsonb_build_object('name', a.name, 'year', ra.year) order by ra.position nulls last, a.name), '[]'::jsonb)
     from public.song_recording_artists ra join public.artists a on a.id = ra.artist_id
     where ra.song_id = s.id) AS recording_artists
  FROM scored scr
  JOIN songs s ON s.id = scr.song_id
  LEFT JOIN song_composers scomp ON scomp.song_id = s.id
  LEFT JOIN song_lyricists slyrc ON slyrc.song_id = s.id
  LEFT JOIN people pe   ON pe.id = scomp.person_id OR pe.id = slyrc.person_id
  LEFT JOIN song_cultures scu2  ON scu2.song_id   = s.id
  LEFT JOIN cultures c          ON c.id           = scu2.culture_id
  LEFT JOIN song_productions sp ON sp.song_id     = s.id
  LEFT JOIN productions pr      ON pr.id          = sp.production_id
  LEFT JOIN song_genres sg      ON sg.song_id     = s.id
  LEFT JOIN genres g            ON g.id           = sg.genre_id
  LEFT JOIN song_languages slng ON slng.song_id   = s.id
  LEFT JOIN languages l         ON l.id           = slng.language_id
  LEFT JOIN song_recording_artists sra ON sra.song_id = s.id
  LEFT JOIN media med ON med.song_id = s.id
  GROUP BY s.id, scr.pop, scr.total, med.youtube_url, med.spotify_url
  ORDER BY scr.total DESC, s.title
  LIMIT p_limit
  OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_songs_for_user(uuid, int, int) TO authenticated;
