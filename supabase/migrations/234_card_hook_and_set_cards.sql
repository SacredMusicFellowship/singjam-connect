-- Migration 234: a song card can show the song's chorus/hook (songs.hook)
-- under its title, and set rows read the same card data as every other list.
--
-- 1. songs.card_line gains 'hook'.
-- 2. song_cards: as in 233, plus card_identity.hook.
-- 3. card(songs): one song's card data (the `card` column song_cards returns),
--    as a computed column so set_songs queries can embed songs(..., card).

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.songs'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%card_line%'
  loop
    execute format('alter table public.songs drop constraint %I', c);
  end loop;
end $$;
alter table public.songs add constraint songs_card_line_check
  check (card_line in ('recordings', 'writers', 'tune', 'scripture', 'first_line', 'hook', 'none'));
comment on column public.songs.card_line is
  'What a song card shows under the title: recordings, writers, tune, scripture, first_line, hook or none. Null = automatic.';

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
        'first_line', nullif(trim(s.first_line), ''),
        'hook', nullif(trim(s.hook), ''),
        'line', s.card_line,
        'origin', o.origin,
        'origin_kind', o.origin_kind,
        'origin_key', o.origin_key
      ) as card_identity
    from ids
    join public.songs s on s.id = ids.id
    join public.song_bylines(p_song_ids) b on b.song_id = s.id
    join public.song_tag_arrays(p_song_ids) tg on tg.song_id = s.id
    left join public.song_origins(p_song_ids) o on o.song_id = s.id
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

create or replace function public.card(s public.songs)
returns jsonb
language sql stable
set search_path to 'public'
as $$
  select c.card from public.song_cards(array[s.id]) c;
$$;

grant execute on function public.song_cards(uuid[]) to anon, authenticated, service_role;
grant execute on function public.card(public.songs) to anon, authenticated, service_role;
