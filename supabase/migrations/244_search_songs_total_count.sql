-- search_songs also returns total_count, every match before the limit, so the
-- Song Library says "Showing 50 of 74 songs" instead of counting the rows it
-- fetched (it said "50 songs" for any big search). The cap rises from 100 to
-- 2000 so "Show all" can load every match. The body is otherwise 238's.

drop function if exists public.search_songs(text, integer);

create function public.search_songs(q text, limit_n integer default 50)
returns table (song_id uuid, title text, display_artist text, first_line text, aka text[], composers text[], cultures text[], productions text[], genres text[], languages text[], themes text[], vibe text, tonality text, meter text, year integer, slug text, score real, popularity bigint, youtube_id text, spotify_track_id text, recording_artists jsonb, production_credits jsonb, forms text[], occasions text[], communities text[], byline text, card_identity jsonb, total_count bigint)
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
    select r.id, r.score, s.title, count(*) over () as total
    from ranked r join public.songs s on s.id = r.id
    order by r.score desc, s.title, r.id
    limit least(greatest(limit_n, 0), 2000)
  )
  select
    s.id, s.title, s.display_artist, s.first_line,
    coalesce((select array_agg(distinct sat.title) from public.song_alternate_titles sat where sat.song_id = s.id), '{}'::text[])
      || coalesce((select array_agg(tt.title order by tt.title) from public.text_titles tt where tt.text_id = s.text_id), '{}'::text[]),
    c.composers, t.cultures, c.productions, t.genres, t.languages, t.themes,
    s.vibe, s.tonality, s.meter, lower(y.span), s.slug, tp.score,
    (select count(*) from public.user_songs us where us.song_id = s.id),
    c.youtube_id, c.spotify_track_id, c.recording_artists, c.production_credits,
    t.forms, t.occasions, t.communities, c.byline, c.card_identity, tp.total
  from top tp
  join public.songs s on s.id = tp.id
  join public.song_cards((select array_agg(id) from top)) c on c.song_id = s.id
  join public.song_tag_arrays((select array_agg(id) from top)) t on t.song_id = s.id
  join public.song_years((select array_agg(id) from top)) y on y.song_id = s.id
  order by tp.score desc, tp.title, tp.id;
end;
$$;

revoke execute on function public.search_songs(text, integer) from public;
grant execute on function public.search_songs(text, integer) to anon, authenticated, service_role;
