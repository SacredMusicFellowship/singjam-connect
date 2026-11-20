-- Search in other alphabets. search_songs normalized both sides with
-- regexp_replace(lower(x), '[^a-z0-9 ]', '', 'g'), which deletes every
-- non-Latin letter: a Hebrew or Arabic query became '%%' and matched every
-- song, and accented Latin lost its letters ("café" → "caf").
--
-- search_normalize keeps letters and digits in every script. It folds
-- compatibility forms (NFKD), lowercases, and strips combining marks (Latin
-- accents, Hebrew niqqud and cantillation, Arabic harakat), punctuation and
-- control characters. The strip set is explicit Unicode ranges rather than
-- [:alnum:], whose meaning depends on the database locale; ASCII text
-- normalizes exactly as before. packages/core normalizeSearch mirrors it.
--
-- A query that normalizes to nothing (only punctuation) no longer matches
-- every song.

create or replace function public.search_normalize(s text)
returns text
language sql immutable parallel safe
as $$
  select regexp_replace(
    lower(normalize(s, NFKD)),
    '[\u0001-\u001f\u0021-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u009f\u00a1-\u00bf\u00d7\u00f7\u0300-\u036f\u0591-\u05c7\u05f3\u05f4\u0600-\u061f\u0640\u064b-\u065f\u066a-\u066d\u0670\u06d4\u06d6-\u06ed\u1ab0-\u1aff\u1dc0-\u1dff\u2010-\u205e\u20d0-\u20ff\u3001-\u303f\ufe20-\ufe2f]',
    '', 'g')
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
    select '%' || q || '%' as p, '%' || nullif(btrim(public.search_normalize(q)), '') || '%' as np, plainto_tsquery('english', q) as tsq
  ),
  -- Each source matched once (correlated per song, the planner scanned
  -- every show with a regex for each song).
  matched as (
    select s.id from public.songs s, pat
    where s.title ilike pat.p or public.search_normalize(s.title) ilike pat.np
      or s.first_line ilike pat.p or public.search_normalize(coalesce(s.first_line,'')) ilike pat.np
      or s.hook ilike pat.p or public.search_normalize(coalesce(s.hook,'')) ilike pat.np
      or s.notes ilike pat.p or public.search_normalize(coalesce(s.notes,'')) ilike pat.np
      or s.display_artist ilike pat.p or public.search_normalize(coalesce(s.display_artist,'')) ilike pat.np
      or to_tsvector('english',
           coalesce(s.title, '') || ' ' || coalesce(s.first_line, '') || ' ' ||
           coalesce(s.display_artist, '') || ' ' || coalesce(s.notes, '')
         ) @@ pat.tsq
    union
    select sat.song_id from public.song_alternate_titles sat, pat
    where sat.title ilike pat.p or public.search_normalize(sat.title) ilike pat.np
    union
    select w.song_id
    from (select song_id, person_id from public.song_composers union all select song_id, person_id from public.song_lyricists) w
    join public.people p on p.id = w.person_id, pat
    where p.name ilike pat.p or public.search_normalize(p.name) ilike pat.np
    union
    select sp.song_id from public.song_productions sp join public.productions pr on pr.id = sp.production_id, pat
    where pr.name ilike pat.p or public.search_normalize(pr.name) ilike pat.np
    union
    select s.id from public.songs s join public.text_titles tt on tt.text_id = s.text_id, pat
    where tt.title ilike pat.p or public.search_normalize(tt.title) ilike pat.np
    union
    select s.id from public.songs s join public.tunes tu on tu.id = s.tune_id, pat
    where tu.name ilike pat.p or public.search_normalize(coalesce(tu.name,'')) ilike pat.np
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
