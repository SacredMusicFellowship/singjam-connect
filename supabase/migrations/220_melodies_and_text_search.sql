-- PR 6, other melodies (one song per melody; songs share a text or a tune).
-- 1. search_songs also matches a song's text titles (transliterations,
--    translations) and its tune's name; text titles join aka.
-- 2. song_melodies(song): the song's other melodies (same text), the other
--    songs sung to its tune (fixed melodies only, not a mode), and the
--    viewer's Lead/Support song that shares its tune ("You know the tune";
--    display only, matching is unchanged).
-- 3. The pilot's tune names kept as alternate titles until now go.

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
    coalesce(array_agg(distinct sat.title) filter (where sat.title is not null), '{}'::text[])
      || coalesce((select array_agg(tt.title order by tt.title) from public.text_titles tt where tt.text_id = s.text_id), '{}'::text[]) as aka,
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

create or replace function public.song_melodies(p_song_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with cur as (
    select s.id, s.text_id, s.tune_id, coalesce(tu.fixed_melody, true) as fixed
    from public.songs s left join public.tunes tu on tu.id = s.tune_id
    where s.id = p_song_id
  ),
  item as (
    select s.id, jsonb_build_object(
      'song_id', s.id, 'slug', s.slug, 'title', s.title, 'display_artist', s.display_artist,
      'tune', tu.name, 'tune_slug', tu.slug,
      'card', public.song_card_fields(s.id),
      'viewer_confidence', (select us.confidence from public.user_songs us where us.song_id = s.id and us.user_id = (select auth.uid()))
    ) as j,
    s.title, (select count(*) from public.user_songs u where u.song_id = s.id) as pop
    from public.songs s left join public.tunes tu on tu.id = s.tune_id
  )
  select jsonb_build_object(
    'other_melodies', coalesce((
      select jsonb_agg(i.j order by i.pop desc, i.title, i.id)
      from cur join public.songs s on s.text_id = cur.text_id and s.id <> cur.id join item i on i.id = s.id), '[]'::jsonb),
    'same_tune', coalesce((
      select jsonb_agg(i.j order by i.pop desc, i.title, i.id)
      from cur join public.songs s on s.tune_id = cur.tune_id and s.id <> cur.id and cur.fixed join item i on i.id = s.id
      where s.text_id is distinct from cur.text_id), '[]'::jsonb),
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
grant execute on function public.song_melodies(uuid) to anon, authenticated, service_role;

delete from public.song_alternate_titles sat
using public.songs s, public.tunes tu
where sat.song_id = s.id and tu.id = s.tune_id and lower(sat.title) = lower(tu.name);
