-- Migration 204: the line under a song's title says how people know it.
--
-- Until now every list and song page showed display_artist (the recording
-- artists) there. For a traditional or religious song that is just whichever
-- recording was linked ("Isaac Zones" under Hinei Ma Tov, "Aretha Franklin,
-- Elvis Presley" under Amazing Grace). byline(song) decides, in one place:
--   * songs.known_by_recording, when a song editor has set it (true/false);
--   * otherwise a song is NOT known by its recording when a writer is
--     "Traditional" or its form is a traditional one (Hymn, Nigun, Zemer,
--     Piyyut, Psalm setting, Liturgical setting, Chant, Lined hymn, Carol).
-- Known by its recording -> display_artist. Otherwise -> its named writers
-- ("John Newton"), or "Traditional · <community or culture>" when there are
-- none ("Traditional · Jewish"). Rule agreed with Ben 2026-11-07.
--
-- byline(songs) is a PostgREST computed field (select=title,byline), and the
-- list RPCs return it as a new last column; older clients ignore it.

alter table public.songs add column if not exists known_by_recording boolean;
comment on column public.songs.known_by_recording is
  'null = decide automatically (see byline()); true = show the recording artists under the title; false = show writers / tradition.';

create or replace function public.byline(s public.songs)
returns text
language sql
stable
set search_path = public
as $$
  with writers as (
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
      (select t.name from public.song_tags st join public.tags t on t.id = st.tag_id
        where st.song_id = s.id and t.type in ('community', 'culture')
        order by (t.type = 'community') desc, (st.context = 'music') desc, t.name
        limit 1) as origin
  )
  select case
    when coalesce(s.known_by_recording, not (f.traditional or f.traditional_form)) then nullif(trim(s.display_artist), '')
    else coalesce(f.named, 'Traditional' || coalesce(' · ' || f.origin, ''))
  end
  from facts f;
$$;
grant execute on function public.byline(public.songs) to anon, authenticated, service_role;

drop function if exists public.my_repertoire();
create function public.my_repertoire()
returns table (
  song_id        uuid,
  confidence     text,
  key_note       text,
  updated_at     timestamptz,
  title          text,
  slug           text,
  display_artist text,
  first_line     text,
  hook           text,
  notes          text,
  vibe           text,
  tonality       text,
  meter          text,
  year           int,
  composers      text[],
  cultures       text[],
  productions    text[],
  genres         text[],
  languages      text[],
  themes         text[],
  popularity     bigint,
  chord_chart_url text,
  forms          text[],
  occasions      text[],
  communities    text[],
  byline         text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    us.song_id,
    us.confidence,
    us.key_note,
    us.updated_at,
    s.title,
    s.slug,
    s.display_artist,
    s.first_line,
    s.hook,
    s.notes,
    s.vibe,
    s.tonality,
    s.meter,
    least(s.year_written, (select min(sra.year) from public.song_recording_artists sra where sra.song_id = s.id)) as year,
    coalesce((
      select array_agg(name order by name) from (
        select p.name from public.song_composers sc join public.people p on p.id = sc.person_id where sc.song_id = s.id
        union
        select p.name from public.song_lyricists sl join public.people p on p.id = sl.person_id where sl.song_id = s.id
      ) names
    ), '{}') as composers,
    public.song_tag_names(s.id, 'culture') as cultures,
    coalesce((select array_agg(pr.name) from public.song_productions sp join public.productions pr on pr.id = sp.production_id where sp.song_id = s.id), '{}') as productions,
    public.song_tag_names(s.id, 'genre') as genres,
    public.song_tag_names(s.id, 'language') as languages,
    public.song_tag_names(s.id, 'theme') as themes,
    (select count(*) from public.user_songs us2 where us2.song_id = us.song_id) as popularity,
    s.chord_chart_url,
    public.song_tag_names(s.id, 'form') as forms,
    public.song_tag_names(s.id, 'occasion') as occasions,
    public.song_tag_names(s.id, 'community') as communities,
    public.byline(s) as byline
  from public.user_songs us
  join public.songs s on s.id = us.song_id
  where us.user_id = (select auth.uid())
  order by s.title asc, us.song_id asc;
$$;
revoke execute on function public.my_repertoire() from public, anon;
grant execute on function public.my_repertoire() to authenticated, service_role;

drop function if exists public.browse_songs(text[], text[], text[], text[], text, text, text, int, int, boolean, text, int, int, text[], text[], text[]);
create function public.browse_songs(
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
  p_limit        int default 20,
  p_forms        text[] default null,
  p_occasions    text[] default null,
  p_communities  text[] default null
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
  production_credits jsonb,
  total_count      bigint,
  forms            text[],
  occasions        text[],
  communities      text[],
  byline           text
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
      public.song_tag_names(s.id, 'genre') as genres,
      public.song_tag_names(s.id, 'language') as languages,
      public.song_tag_names(s.id, 'theme') as themes,
      public.song_tag_names(s.id, 'culture') as cultures,
      public.song_tag_names(s.id, 'form') as forms,
      public.song_tag_names(s.id, 'occasion') as occasions,
      public.song_tag_names(s.id, 'community') as communities,
      least(s.year_written, (select min(sra.year) from public.song_recording_artists sra where sra.song_id = s.id)) as year,
      (select count(*) from public.user_songs us where us.song_id = s.id) as popularity
    from public.songs s
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
    (select coalesce(jsonb_agg(jsonb_build_object('name', pc.name, 'year', pc.year) order by pc.year nulls last, pc.name), '[]'::jsonb)
     from public.song_productions spc join public.productions pc on pc.id = spc.production_id
     where spc.song_id = s.id) as production_credits,
    pg.total_count,
    pg.forms,
    pg.occasions,
    pg.communities,
    public.byline(s) as byline
  from page pg
  join public.songs s on s.id = pg.id
  order by
    case when p_sort = 'title_asc'  then pg.title end asc,
    case when p_sort = 'title_desc' then pg.title end desc,
    case when p_sort not in ('title_asc', 'title_desc') then pg.popularity end desc,
    pg.title asc,
    pg.id asc;
$$;
revoke execute on function public.browse_songs(text[], text[], text[], text[], text, text, text, int, int, boolean, text, int, int, text[], text[], text[]) from public;
grant execute on function public.browse_songs(text[], text[], text[], text[], text, text, text, int, int, boolean, text, int, int, text[], text[], text[]) to anon, authenticated, service_role;

drop function if exists public.search_songs(text, int);
create function public.search_songs(q text, limit_n int default 50)
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
  recording_artists jsonb,
  production_credits jsonb,
  forms            text[],
  occasions        text[],
  communities      text[],
  byline           text
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
    coalesce(array_agg(distinct sat.title) filter (where sat.title is not null), '{}'::text[]) as aka,
    coalesce(array_agg(distinct p.name) filter (where p.name is not null), '{}'::text[]) as composers,
    public.song_tag_names(s.id, 'culture') as cultures,
    coalesce(array_agg(distinct pr.name) filter (where pr.name is not null), '{}'::text[]) as productions,
    public.song_tag_names(s.id, 'genre') as genres,
    public.song_tag_names(s.id, 'language') as languages,
    public.song_tag_names(s.id, 'theme') as themes,
    s.vibe,
    s.tonality,
    s.meter,
    least(s.year_written, min(sra.year)) as year,
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
    (regexp_match(coalesce(med.youtube_url, s.youtube_url), '(?:youtu\.be/|[?&]v=|/(?:embed|v|shorts)/)([a-zA-Z0-9_-]{11})'))[1] as youtube_id,
    (regexp_match(med.spotify_url, '/track/([a-zA-Z0-9]+)'))[1] as spotify_track_id,
    (select coalesce(jsonb_agg(jsonb_build_object('name', a.name, 'year', ra.year) order by ra.position nulls last, a.name), '[]'::jsonb)
     from public.song_recording_artists ra join public.artists a on a.id = ra.artist_id
     where ra.song_id = s.id) as recording_artists,
    (select coalesce(jsonb_agg(jsonb_build_object('name', pc.name, 'year', pc.year) order by pc.year nulls last, pc.name), '[]'::jsonb)
     from public.song_productions spc join public.productions pc on pc.id = spc.production_id
     where spc.song_id = s.id) as production_credits,
    public.song_tag_names(s.id, 'form') as forms,
    public.song_tag_names(s.id, 'occasion') as occasions,
    public.song_tag_names(s.id, 'community') as communities,
    public.byline(s) as byline
  from matched m
  join public.songs s on s.id = m.id
  left join public.song_alternate_titles sat on sat.song_id = s.id
  left join public.song_composers sc on sc.song_id = s.id
  left join public.song_lyricists sl on sl.song_id = s.id
  left join public.people p on p.id = sc.person_id or p.id = sl.person_id
  left join public.song_recording_artists sra on sra.song_id = s.id
  left join public.song_productions sp on sp.song_id = s.id
  left join public.productions pr on pr.id = sp.production_id
  left join media med on med.song_id = s.id
  group by s.id, med.youtube_url, med.spotify_url
  order by score desc, s.title
  limit least(greatest(limit_n, 0), 100);
$$;
revoke execute on function public.search_songs(text, int) from public;
grant execute on function public.search_songs(text, int) to anon, authenticated, service_role;

drop function if exists public.suggest_songs_for_user(uuid, int, int);
create function public.suggest_songs_for_user(
  p_user_id uuid,
  p_limit   int default 20,
  p_offset  int default 0
)
returns table (
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
  recording_artists jsonb,
  production_credits jsonb,
  communities      text[],
  byline           text
)
language sql
security definer
set search_path = public
as $$
  with user_tags as (
    select distinct st.tag_id
    from public.user_songs us
    join public.song_tags st on st.song_id = us.song_id
    join public.tags t on t.id = st.tag_id
    where us.user_id = p_user_id and t.type in ('genre', 'culture', 'community')
  ),
  popularity as (
    select song_id, count(*) as user_count
    from public.user_songs
    group by song_id
  ),
  affinity as (
    select s.id as song_id, count(distinct ut.tag_id) as score
    from public.songs s
    left join public.song_tags st on st.song_id = s.id
    left join user_tags ut on ut.tag_id = st.tag_id
    where s.id not in (select song_id from public.user_songs where user_id = p_user_id)
    group by s.id
  ),
  scored as (
    select a.song_id, coalesce(p.user_count, 0) as pop, a.score * 3 + coalesce(p.user_count, 0) as total
    from affinity a
    left join popularity p on p.song_id = a.song_id
    where coalesce(p.user_count, 0) > 0
  ),
  media as (
    select distinct on (song_id) song_id, youtube_url, spotify_url
    from public.song_recording_artists
    order by song_id, position nulls last
  )
  select
    s.id,
    s.title,
    s.display_artist,
    s.first_line,
    s.slug,
    coalesce(array_agg(distinct pe.name) filter (where pe.name is not null), '{}'::text[]) as composers,
    public.song_tag_names(s.id, 'culture') as cultures,
    coalesce(array_agg(distinct pr.name) filter (where pr.name is not null), '{}'::text[]) as productions,
    public.song_tag_names(s.id, 'genre') as genres,
    public.song_tag_names(s.id, 'language') as languages,
    least(s.year_written, min(sra.year)) as year,
    scr.pop as popularity,
    (regexp_match(coalesce(med.youtube_url, s.youtube_url), '(?:youtu\.be/|[?&]v=|/(?:embed|v|shorts)/)([a-zA-Z0-9_-]{11})'))[1] as youtube_id,
    (regexp_match(med.spotify_url, '/track/([a-zA-Z0-9]+)'))[1] as spotify_track_id,
    (select coalesce(jsonb_agg(jsonb_build_object('name', a.name, 'year', ra.year) order by ra.position nulls last, a.name), '[]'::jsonb)
     from public.song_recording_artists ra join public.artists a on a.id = ra.artist_id
     where ra.song_id = s.id) as recording_artists,
    (select coalesce(jsonb_agg(jsonb_build_object('name', pc.name, 'year', pc.year) order by pc.year nulls last, pc.name), '[]'::jsonb)
     from public.song_productions spc join public.productions pc on pc.id = spc.production_id
     where spc.song_id = s.id) as production_credits,
    public.song_tag_names(s.id, 'community') as communities,
    public.byline(s) as byline
  from scored scr
  join public.songs s on s.id = scr.song_id
  left join public.song_composers scomp on scomp.song_id = s.id
  left join public.song_lyricists slyrc on slyrc.song_id = s.id
  left join public.people pe on pe.id = scomp.person_id or pe.id = slyrc.person_id
  left join public.song_productions sp on sp.song_id = s.id
  left join public.productions pr on pr.id = sp.production_id
  left join public.song_recording_artists sra on sra.song_id = s.id
  left join media med on med.song_id = s.id
  group by s.id, scr.pop, scr.total, med.youtube_url, med.spotify_url
  order by scr.total desc, s.title
  limit p_limit
  offset p_offset;
$$;
grant execute on function public.suggest_songs_for_user(uuid, int, int) to authenticated;

-- save_song: as in 202, plus fields.known_by_recording (left alone when absent,
-- so older clients don't reset it).
create or replace function public.save_song(p_song_id uuid, p jsonb)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  f jsonb := coalesce(p->'fields', '{}'::jsonb);
  ids uuid[];
  rec jsonb;
  artist uuid;
  pos int := 0;
  prod jsonb;
  prod_id uuid;
  prod_year int;
  updated int;
  result text;
  ty text;
  ctx text;
  tag_spec jsonb;
  tag_id uuid;
  legacy_types text[] := array[]::text[];
begin
  if coalesce(trim(f->>'title'), '') = '' then
    raise exception 'Title is required.' using errcode = '22023';
  end if;

  update public.songs set
    title           = trim(f->>'title'),
    display_artist  = nullif(trim(f->>'display_artist'), ''),
    first_line      = nullif(trim(f->>'first_line'), ''),
    hook            = nullif(trim(f->>'hook'), ''),
    notes           = nullif(trim(f->>'notes'), ''),
    genius_url      = nullif(trim(f->>'genius_url'), ''),
    chord_chart_url = nullif(trim(f->>'chord_chart_url'), ''),
    year            = (f->>'year')::int,
    year_written    = (f->>'year_written')::int,
    tonality        = nullif(f->>'tonality', ''),
    meter           = nullif(f->>'meter', ''),
    vibe            = nullif(f->>'vibe', ''),
    known_by_recording = case when f ? 'known_by_recording' then (f->>'known_by_recording')::boolean else known_by_recording end,
    updated_at      = now()
  where id = p_song_id;
  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'Song not found, or you can''t edit it.' using errcode = '42501';
  end if;

  -- Tags
  if p ? 'tags' then
    for ty in select jsonb_object_keys(p->'tags') loop
      if ty not in ('genre', 'theme', 'culture', 'language', 'form', 'occasion', 'community') then
        raise exception 'Unknown tag type: %', ty using errcode = '22023';
      end if;
      select coalesce(array_agg(distinct x) filter (where x is not null), '{}') into ids
        from (select public.lookup_or_create_tag(ty, n) x from jsonb_array_elements_text(coalesce(p->'tags'->ty, '[]')) n) t;
      delete from public.song_tags st using public.tags t
       where st.song_id = p_song_id and st.context = 'general' and t.id = st.tag_id and t.type = ty and st.tag_id <> all(ids);
      insert into public.song_tags (song_id, tag_id) select p_song_id, x from unnest(ids) x on conflict do nothing;
    end loop;

    foreach ctx in array array['music', 'lyrics'] loop
      tag_spec := p->(case ctx when 'music' then 'music_tag' else 'lyric_tag' end);
      if p ? (case ctx when 'music' then 'music_tag' else 'lyric_tag' end) then
        delete from public.song_tags where song_id = p_song_id and context = ctx;
        if tag_spec is not null and jsonb_typeof(tag_spec) = 'object' and nullif(trim(tag_spec->>'name'), '') is not null then
          select id into tag_id from public.tags
           where type = coalesce(tag_spec->>'type', 'culture') and lower(name) = lower(trim(tag_spec->>'name')) limit 1;
          if tag_id is null then raise exception 'Unknown tag: %', tag_spec->>'name' using errcode = '22023'; end if;
          insert into public.song_tags (song_id, tag_id, context) values (p_song_id, tag_id, ctx);
        end if;
      end if;
    end loop;
  else
    -- Old shape: each old list replaces the tags that came from that old table.
    foreach ty in array array['genres', 'themes', 'languages', 'cultures'] loop
      if p ? ty then
        select coalesce(array_agg(distinct x) filter (where x is not null), '{}') into ids
          from (select public.legacy_tag_for(ty, n) x from jsonb_array_elements_text(coalesce(p->ty, '[]')) n) t;
        delete from public.song_tags st
         where st.song_id = p_song_id and st.context = 'general' and st.tag_id <> all(ids)
           and exists (select 1 from public.tag_legacy_map m where m.tag_id = st.tag_id and m.legacy_table = ty);
        insert into public.song_tags (song_id, tag_id) select p_song_id, x from unnest(ids) x on conflict do nothing;
      end if;
    end loop;

    if p ? 'music_culture' or p ? 'lyric_culture' then
      delete from public.song_tags where song_id = p_song_id and context in ('music', 'lyrics');
      foreach ctx in array array['music', 'lyrics'] loop
        if nullif(trim(p->>(case ctx when 'music' then 'music_culture' else 'lyric_culture' end)), '') is not null then
          tag_id := public.legacy_tag_for('cultures', p->>(case ctx when 'music' then 'music_culture' else 'lyric_culture' end));
          if tag_id is null then raise exception 'Unknown culture: %', p->>(case ctx when 'music' then 'music_culture' else 'lyric_culture' end) using errcode = '22023'; end if;
          insert into public.song_tags (song_id, tag_id, context) values (p_song_id, tag_id, ctx) on conflict do nothing;
        end if;
      end loop;
    end if;
  end if;

  -- Writers
  select coalesce(array_agg(distinct x), '{}') into ids from (
    select (jsonb_array_elements_text(coalesce(p->'composer_ids', '[]')))::uuid x
    union all
    select public.lookup_or_create_named('people', n) from jsonb_array_elements_text(coalesce(p->'composer_names', '[]')) n
  ) c where x is not null;
  delete from public.song_composers where song_id = p_song_id and person_id <> all(ids);
  insert into public.song_composers (song_id, person_id) select p_song_id, x from unnest(ids) x on conflict do nothing;

  select coalesce(array_agg(distinct x), '{}') into ids from (
    select (jsonb_array_elements_text(coalesce(p->'lyricist_ids', '[]')))::uuid x
    union all
    select public.lookup_or_create_named('people', n) from jsonb_array_elements_text(coalesce(p->'lyricist_names', '[]')) n
  ) l where x is not null;
  delete from public.song_lyricists where song_id = p_song_id and person_id <> all(ids);
  insert into public.song_lyricists (song_id, person_id) select p_song_id, x from unnest(ids) x on conflict do nothing;

  -- Recordings: removals first, so a swap at the recording cap (194) never
  -- briefly counts as one too many.
  select coalesce(array_agg(coalesce((r->>'artist_id')::uuid, public.lookup_or_create_named('artists', r->>'name')) order by ord), '{}')
    into ids
    from jsonb_array_elements(coalesce(p->'recordings', '[]')) with ordinality as t(r, ord);
  delete from public.song_recording_artists where song_id = p_song_id and artist_id <> all(array_remove(ids, null));
  for rec in select r from jsonb_array_elements(coalesce(p->'recordings', '[]')) r loop
    artist := ids[pos + 1];
    if artist is not null then
      insert into public.song_recording_artists (song_id, artist_id, year, position, youtube_url, spotify_url)
      values (p_song_id, artist, (rec->>'year')::int, pos, nullif(rec->>'youtube_url', ''), nullif(rec->>'spotify_url', ''))
      on conflict (song_id, artist_id) do update set
        year        = excluded.year,
        position    = excluded.position,
        youtube_url = excluded.youtube_url,
        spotify_url = case when rec ? 'spotify_url' then excluded.spotify_url else song_recording_artists.spotify_url end;
    end if;
    pos := pos + 1;
  end loop;

  -- Productions
  ids := '{}';
  for prod in select r from jsonb_array_elements(coalesce(p->'productions', '[]')) r loop
    prod_year := (prod->>'year')::int;
    if prod->>'id' is not null then
      prod_id := (prod->>'id')::uuid;
      update public.productions set year = prod_year where id = prod_id and year is distinct from prod_year;
    else
      select id into prod_id from public.productions where name = trim(prod->>'name') and year is not distinct from prod_year limit 1;
      if prod_id is null then
        insert into public.productions (name, year) values (trim(prod->>'name'), prod_year) returning id into prod_id;
      end if;
    end if;
    ids := ids || prod_id;
  end loop;
  delete from public.song_productions where song_id = p_song_id and production_id <> all(ids);
  insert into public.song_productions (song_id, production_id) select p_song_id, x from unnest(ids) x where x is not null on conflict do nothing;

  set constraints all immediate;
  select slug into result from public.songs where id = p_song_id;
  return result;
end;
$$;
revoke execute on function public.save_song(uuid, jsonb) from public, anon;
grant execute on function public.save_song(uuid, jsonb) to authenticated, service_role;
