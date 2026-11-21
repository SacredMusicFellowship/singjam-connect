-- Migration 213: song cards link their shows, and Browse lists traditional
-- songs by culture.
--
-- 1. production_credits on the card RPCs also carries each show's slug, so
--    "from Hamilton" opens /shows/<slug> (two shows can share a name). Same
--    signatures, so these are plain create-or-replace of the live definitions.
-- 2. traditional_culture_counts(): each culture with how many songs credited
--    to "Traditional" carry it (the Browse hub's Traditional songs section).

-- browse_songs
CREATE OR REPLACE FUNCTION public.browse_songs(p_genres text[] DEFAULT NULL::text[], p_languages text[] DEFAULT NULL::text[], p_themes text[] DEFAULT NULL::text[], p_cultures text[] DEFAULT NULL::text[], p_vibe text DEFAULT NULL::text, p_tonality text DEFAULT NULL::text, p_meter text DEFAULT NULL::text, p_year_min integer DEFAULT NULL::integer, p_year_max integer DEFAULT NULL::integer, p_exclude_mine boolean DEFAULT false, p_sort text DEFAULT 'popularity'::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 20, p_forms text[] DEFAULT NULL::text[], p_occasions text[] DEFAULT NULL::text[], p_communities text[] DEFAULT NULL::text[], p_song_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(song_id uuid, title text, slug text, display_artist text, composers text[], cultures text[], productions text[], genres text[], languages text[], themes text[], vibe text, tonality text, meter text, year integer, popularity bigint, youtube_id text, spotify_track_id text, recording_artists jsonb, production_credits jsonb, total_count bigint, forms text[], occasions text[], communities text[], byline text, card_identity jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    where p_song_ids is null or s.id = any(p_song_ids)
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
      and (p_song_ids is null or m.id = any(p_song_ids))
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
    (select coalesce(jsonb_agg(jsonb_build_object('name', pc.name, 'year', pc.year, 'slug', pc.slug) order by pc.year nulls last, pc.name), '[]'::jsonb)
     from public.song_productions spc join public.productions pc on pc.id = spc.production_id
     where spc.song_id = s.id) as production_credits,
    pg.total_count,
    pg.forms,
    pg.occasions,
    pg.communities,
    public.byline(s) as byline,
    public.song_card_identity(s) as card_identity
  from page pg
  join public.songs s on s.id = pg.id
  order by
    case when p_sort = 'title_asc'  then pg.title end asc,
    case when p_sort = 'title_desc' then pg.title end desc,
    case when p_sort not in ('title_asc', 'title_desc') then pg.popularity end desc,
    pg.title asc,
    pg.id asc;
$function$;

-- search_songs
CREATE OR REPLACE FUNCTION public.search_songs(q text, limit_n integer DEFAULT 50)
 RETURNS TABLE(song_id uuid, title text, display_artist text, first_line text, aka text[], composers text[], cultures text[], productions text[], genres text[], languages text[], themes text[], vibe text, tonality text, meter text, year integer, slug text, score real, popularity bigint, youtube_id text, spotify_track_id text, recording_artists jsonb, production_credits jsonb, forms text[], occasions text[], communities text[], byline text, card_identity jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    (select coalesce(jsonb_agg(jsonb_build_object('name', pc.name, 'year', pc.year, 'slug', pc.slug) order by pc.year nulls last, pc.name), '[]'::jsonb)
     from public.song_productions spc join public.productions pc on pc.id = spc.production_id
     where spc.song_id = s.id) as production_credits,
    public.song_tag_names(s.id, 'form') as forms,
    public.song_tag_names(s.id, 'occasion') as occasions,
    public.song_tag_names(s.id, 'community') as communities,
    public.byline(s) as byline,
    public.song_card_identity(s) as card_identity
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
$function$;

-- suggest_songs_for_user
CREATE OR REPLACE FUNCTION public.suggest_songs_for_user(p_user_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(song_id uuid, title text, display_artist text, first_line text, slug text, composers text[], cultures text[], productions text[], genres text[], languages text[], year integer, popularity bigint, youtube_id text, spotify_track_id text, recording_artists jsonb, production_credits jsonb, communities text[], byline text, card_identity jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    (select coalesce(jsonb_agg(jsonb_build_object('name', pc.name, 'year', pc.year, 'slug', pc.slug) order by pc.year nulls last, pc.name), '[]'::jsonb)
     from public.song_productions spc join public.productions pc on pc.id = spc.production_id
     where spc.song_id = s.id) as production_credits,
    public.song_tag_names(s.id, 'community') as communities,
    public.byline(s) as byline,
    public.song_card_identity(s) as card_identity
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
$function$;

create or replace function public.traditional_culture_counts()
returns table (name text, slug text, song_count bigint)
language sql
stable
set search_path = public
as $$
  with trad as (
    select sc.song_id from public.song_composers sc join public.people p on p.id = sc.person_id where p.name = 'Traditional'
    union
    select sl.song_id from public.song_lyricists sl join public.people p on p.id = sl.person_id where p.name = 'Traditional'
  )
  select t.name, t.slug, count(distinct st.song_id)
  from trad
  join public.song_tags st on st.song_id = trad.song_id
  join public.tags t on t.id = st.tag_id and t.type = 'culture'
  group by t.name, t.slug
  order by count(distinct st.song_id) desc, t.name;
$$;
grant execute on function public.traditional_culture_counts() to anon, authenticated, service_role;
