-- Every song-list RPC builds on the set-based helpers of migration 228, and
-- the per-song helpers they replace are dropped. Same results, except:
-- * search_songs and suggest_songs_for_user play the same video and Spotify
--   track as browse_songs (the first recording that has one; they took the
--   first recording even when it had none);
-- * song_filter_meta takes optional song ids, so a page asks for its songs only;
-- * browse_songs also returns year_max (a song's date as a span).

-- The filter fields for these songs (null = every song).
drop function if exists public.song_filter_meta();
create function public.song_filter_meta(p_song_ids uuid[] default null)
returns table (song_id uuid, genres text[], languages text[], themes text[], cultures text[], vibe text, tonality text, meter text, year integer, year_max integer, forms text[], occasions text[], communities text[])
language sql stable
set search_path to 'public'
as $$
  select
    s.id, t.genres, t.languages, t.themes, t.cultures, s.vibe, s.tonality, s.meter,
    lower(y.span), upper(y.span) - 1, t.forms, t.occasions, t.communities
  from public.songs s
  join public.song_tag_arrays(p_song_ids) t on t.song_id = s.id
  join public.song_years(p_song_ids) y on y.song_id = s.id
  where p_song_ids is null or s.id = any(p_song_ids);
$$;
grant execute on function public.song_filter_meta(uuid[]) to anon, authenticated, service_role;

drop function if exists public.browse_songs(text[], text[], text[], text[], text, text, text, integer, integer, boolean, text, integer, integer, text[], text[], text[], uuid[]);
create function public.browse_songs(
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
revoke execute on function public.browse_songs(text[], text[], text[], text[], text, text, text, integer, integer, boolean, text, integer, integer, text[], text[], text[], uuid[]) from public;
grant execute on function public.browse_songs(text[], text[], text[], text[], text, text, text, integer, integer, boolean, text, integer, integer, text[], text[], text[], uuid[]) to anon, authenticated, service_role;

create or replace function public.search_songs(q text, limit_n integer default 50)
returns table (song_id uuid, title text, display_artist text, first_line text, aka text[], composers text[], cultures text[], productions text[], genres text[], languages text[], themes text[], vibe text, tonality text, meter text, year integer, slug text, score real, popularity bigint, youtube_id text, spotify_track_id text, recording_artists jsonb, production_credits jsonb, forms text[], occasions text[], communities text[], byline text, card_identity jsonb)
language sql stable security definer
set search_path to 'public'
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
      or exists (
        select 1 from public.text_titles tt
        where tt.text_id = s.text_id
          and (tt.title ilike '%' || q || '%' or regexp_replace(lower(tt.title), '[^a-z0-9 ]', '', 'g') ilike '%' || normalized.nq || '%'))
      or exists (
        select 1 from public.tunes tu
        where tu.id = s.tune_id
          and (tu.name ilike '%' || q || '%' or regexp_replace(lower(coalesce(tu.name,'')), '[^a-z0-9 ]', '', 'g') ilike '%' || normalized.nq || '%'))
      or to_tsvector('english',
           coalesce(s.title, '') || ' ' ||
           coalesce(s.first_line, '') || ' ' ||
           coalesce(s.display_artist, '') || ' ' ||
           coalesce(s.notes, '')
         ) @@ plainto_tsquery('english', q)
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
        plainto_tsquery('english', q)
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
$$;

create or replace function public.suggest_songs_for_user(p_user_id uuid, p_limit integer default 20, p_offset integer default 0)
returns table (song_id uuid, title text, display_artist text, first_line text, slug text, composers text[], cultures text[], productions text[], genres text[], languages text[], year integer, popularity bigint, youtube_id text, spotify_track_id text, recording_artists jsonb, production_credits jsonb, communities text[], byline text, card_identity jsonb)
language sql security definer
set search_path to 'public'
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
  page as (
    select a.song_id, s.title, coalesce(p.user_count, 0) as pop, a.score * 3 + coalesce(p.user_count, 0) as total
    from affinity a
    join public.songs s on s.id = a.song_id
    left join popularity p on p.song_id = a.song_id
    where coalesce(p.user_count, 0) > 0
    order by total desc, s.title, a.song_id
    limit p_limit
    offset p_offset
  )
  select
    s.id, s.title, s.display_artist, s.first_line, s.slug,
    c.composers, t.cultures, c.productions, t.genres, t.languages, lower(y.span), pg.pop,
    c.youtube_id, c.spotify_track_id, c.recording_artists, c.production_credits,
    t.communities, c.byline, c.card_identity
  from page pg
  join public.songs s on s.id = pg.song_id
  join public.song_cards((select array_agg(song_id) from page)) c on c.song_id = s.id
  join public.song_tag_arrays((select array_agg(song_id) from page)) t on t.song_id = s.id
  join public.song_years((select array_agg(song_id) from page)) y on y.song_id = s.id
  order by pg.total desc, pg.title, pg.song_id;
$$;

create or replace function public.my_repertoire()
returns table (song_id uuid, confidence text, key_note text, updated_at timestamp with time zone, title text, slug text, display_artist text, first_line text, hook text, notes text, vibe text, tonality text, meter text, year integer, composers text[], cultures text[], productions text[], genres text[], languages text[], themes text[], popularity bigint, chord_chart_url text, forms text[], occasions text[], communities text[], byline text, card_identity jsonb, recording_artists jsonb)
language sql stable security definer
set search_path to 'public'
as $$
  with mine as (
    select us.song_id, us.confidence, us.key_note, us.updated_at
    from public.user_songs us
    where us.user_id = (select auth.uid())
  ),
  ids as (select array_agg(song_id) as a from mine)
  select
    m.song_id, m.confidence, m.key_note, m.updated_at,
    s.title, s.slug, s.display_artist, s.first_line, s.hook, s.notes, s.vibe, s.tonality, s.meter,
    lower(y.span), c.composers, t.cultures, c.productions, t.genres, t.languages, t.themes,
    (select count(*) from public.user_songs us2 where us2.song_id = m.song_id),
    s.chord_chart_url, t.forms, t.occasions, t.communities, c.byline, c.card_identity, c.recording_artists
  from mine m
  join public.songs s on s.id = m.song_id
  join public.song_cards((select a from ids)) c on c.song_id = m.song_id
  join public.song_tag_arrays((select a from ids)) t on t.song_id = m.song_id
  join public.song_years((select a from ids)) y on y.song_id = m.song_id
  order by s.title asc, m.song_id asc;
$$;

create or replace function public.solo_set_songs(set_id_param uuid)
returns table (song_id uuid, slug text, title text, display_artist text, viewer_has boolean, viewer_leads boolean, who_else text[], who_else_leads text[], in_set boolean, popularity bigint, card jsonb)
language sql stable security definer
set search_path to 'public'
as $$
  with viewer_is_participant as (
    select 1 from public.sets
    where id = set_id_param and owner_user_id = auth.uid()
    union all
    select 1 from public.set_collaborators sc
    where sc.set_id = set_id_param
      and sc.user_id = auth.uid()
      and sc.status = 'accepted'
  ),
  mine as (
    select us.song_id, us.confidence
    from public.user_songs us
    where us.user_id = auth.uid()
      and us.confidence in ('lead', 'support', 'learn')
      and exists (select 1 from viewer_is_participant)
  )
  select
    s.id, s.slug, s.title, s.display_artist,
    true,
    (m.confidence = 'lead'),
    '{}'::text[],
    '{}'::text[],
    exists (select 1 from public.set_songs ss where ss.set_id = set_id_param and ss.song_id = s.id),
    (select count(*) from public.user_songs u where u.song_id = s.id) as popularity,
    c.card
  from mine m
  join public.songs s on s.id = m.song_id
  join public.song_cards((select array_agg(song_id) from mine)) c on c.song_id = s.id
  order by popularity desc, s.title, s.id;
$$;

create or replace function public.set_shared_songs(set_id_param uuid)
returns table (song_id uuid, slug text, title text, display_artist text, viewer_has boolean, viewer_leads boolean, who_else text[], who_else_leads text[], in_set boolean, card jsonb)
language sql stable security definer
set search_path to 'public'
as $$
  with viewer_is_participant as (
    select 1
    from public.sets s
    where s.id = set_id_param and s.owner_user_id = auth.uid()
    union all
    select 1
    from public.set_collaborators sc
    where sc.set_id = set_id_param
      and sc.user_id = auth.uid()
      and sc.status = 'accepted'
  ),
  participants as (
    select s.owner_user_id as user_id
    from public.sets s
    where s.id = set_id_param
      and s.owner_user_id <> auth.uid()
    union
    select sc.user_id
    from public.set_collaborators sc
    where sc.set_id = set_id_param
      and sc.status = 'accepted'
      and sc.user_id <> auth.uid()
      and sc.user_id is not null
  ),
  viewer_songs as (
    select song_id, confidence
    from public.user_songs
    where user_id = auth.uid()
      and confidence in ('lead', 'support', 'learn')
      and exists (select 1 from viewer_is_participant)
  ),
  others_knowledge as (
    select
      os.song_id,
      coalesce(nullif(trim(p.display_name), ''), p.username) as other_name,
      os.confidence                                           as other_conf
    from public.user_songs os
    join participants pt on pt.user_id = os.user_id
    join public.profiles p on p.id = os.user_id
    where os.confidence in ('lead', 'support', 'learn')
  ),
  viewer_shared as (
    select
      s.id                                                                                            as song_id,
      s.slug,
      s.title,
      s.display_artist,
      true                                                                                            as viewer_has,
      bool_or(vs.confidence = 'lead')                                                                  as viewer_leads,
      coalesce(array_agg(distinct ok.other_name order by ok.other_name) filter (where ok.other_name is not null), '{}') as who_else,
      coalesce(array_agg(distinct ok.other_name order by ok.other_name) filter (where ok.other_conf = 'lead'), '{}')   as who_else_leads
    from viewer_songs vs
    join public.songs s on s.id = vs.song_id
    left join others_knowledge ok on ok.song_id = vs.song_id
    group by s.id, s.slug, s.title, s.display_artist
  ),
  others_shared as (
    select
      s.id                                                                                            as song_id,
      s.slug,
      s.title,
      s.display_artist,
      false                                                                                           as viewer_has,
      false                                                                                           as viewer_leads,
      array_agg(distinct ok.other_name order by ok.other_name)                                        as who_else,
      coalesce(array_agg(distinct ok.other_name order by ok.other_name) filter (where ok.other_conf = 'lead'), '{}') as who_else_leads
    from others_knowledge ok
    join public.songs s on s.id = ok.song_id
    where ok.song_id not in (select song_id from viewer_songs)
      and exists (select 1 from viewer_is_participant)
    group by s.id, s.slug, s.title, s.display_artist
    having bool_or(ok.other_conf = 'lead')
  ),
  combined as (
    select * from viewer_shared
    union all
    select * from others_shared
  )
  select
    cb.song_id, cb.slug, cb.title, cb.display_artist, cb.viewer_has, cb.viewer_leads, cb.who_else, cb.who_else_leads,
    exists (select 1 from public.set_songs ss where ss.set_id = set_id_param and ss.song_id = cb.song_id),
    c.card
  from combined cb
  join public.song_cards((select array_agg(song_id) from combined)) c on c.song_id = cb.song_id
  order by (cardinality(cb.who_else) = 0), cardinality(cb.who_else) desc, cb.title, cb.song_id;
$$;

-- The song page's other melodies: other settings of its text, other texts
-- sung to its (fixed) tune, and a tune the viewer already knows.
create or replace function public.song_melodies(p_song_id uuid)
returns jsonb
language sql stable
set search_path to 'public'
as $$
  with cur as (
    select s.id, s.text_id, s.tune_id, coalesce(tu.fixed_melody, true) as fixed
    from public.songs s left join public.tunes tu on tu.id = s.tune_id
    where s.id = p_song_id
  ),
  other as (
    select s.id from cur join public.songs s on s.text_id = cur.text_id and s.id <> cur.id
  ),
  same as (
    select s.id from cur join public.songs s on s.tune_id = cur.tune_id and s.id <> cur.id and cur.fixed
    where s.text_id is distinct from cur.text_id
  ),
  item as (
    select s.id, jsonb_build_object(
      'song_id', s.id, 'slug', s.slug, 'title', s.title, 'display_artist', s.display_artist,
      'tune', tu.name, 'tune_slug', tu.slug,
      'card', c.card,
      'viewer_confidence', (select us.confidence from public.user_songs us where us.song_id = s.id and us.user_id = (select auth.uid()))
    ) as j,
    s.title, (select count(*) from public.user_songs u where u.song_id = s.id) as pop
    from public.songs s
    left join public.tunes tu on tu.id = s.tune_id
    join public.song_cards(array(select id from other union select id from same)) c on c.song_id = s.id
  )
  select jsonb_build_object(
    'other_melodies', coalesce((select jsonb_agg(i.j order by i.pop desc, i.title, i.id) from other o join item i on i.id = o.id), '[]'::jsonb),
    'same_tune', coalesce((select jsonb_agg(i.j order by i.pop desc, i.title, i.id) from same o join item i on i.id = o.id), '[]'::jsonb),
    'known_tune', (
      select jsonb_build_object('title', s.title, 'slug', s.slug, 'confidence', us.confidence)
      from cur
      join public.songs s on s.tune_id = cur.tune_id and s.id <> cur.id and cur.fixed
      join public.user_songs us on us.song_id = s.id and us.user_id = (select auth.uid()) and us.confidence in ('lead', 'support')
      order by (us.confidence = 'lead') desc, s.title, s.id
      limit 1)
  )
  from cur;
$$;

drop function if exists public.song_card_fields(uuid);
drop function if exists public.song_card_identity(public.songs);
drop function if exists public.song_tag_names(uuid, text);
drop function if exists public.song_year_span(public.songs);
