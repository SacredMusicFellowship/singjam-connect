-- My songs rows show recordings the way song cards and the set's Add songs
-- panel do (song_card_fields, migration 218), so my_repertoire gains a last
-- column, recording_artists. Same body otherwise; grants restated.

drop function if exists public.my_repertoire();
CREATE FUNCTION public.my_repertoire()
 RETURNS TABLE(song_id uuid, confidence text, key_note text, updated_at timestamp with time zone, title text, slug text, display_artist text, first_line text, hook text, notes text, vibe text, tonality text, meter text, year integer, composers text[], cultures text[], productions text[], genres text[], languages text[], themes text[], popularity bigint, chord_chart_url text, forms text[], occasions text[], communities text[], byline text, card_identity jsonb, recording_artists jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    public.byline(s) as byline,
    public.song_card_identity(s) as card_identity,
    (
      select coalesce(jsonb_agg(jsonb_build_object('name', a.name, 'year', ra.year) order by ra.position nulls last, a.name), '[]'::jsonb)
      from public.song_recording_artists ra join public.artists a on a.id = ra.artist_id where ra.song_id = s.id
    ) as recording_artists
  from public.user_songs us
  join public.songs s on s.id = us.song_id
  where us.user_id = (select auth.uid())
  order by s.title asc, us.song_id asc;
$function$;

revoke execute on function public.my_repertoire() from public, anon;
grant execute on function public.my_repertoire() to authenticated, service_role;
