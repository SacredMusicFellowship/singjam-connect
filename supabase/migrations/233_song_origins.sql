-- One rule for where a traditional song comes from ("Traditional · …").
-- Before this, the byline (song_bylines) put a non-Christian community first
-- while song cards took the first culture, so Sevivon read "Traditional ·
-- Jewish" on its page and "Traditional · Israeli" on cards.
--
-- song_origins picks, per song: a non-Christian community, then a culture,
-- then a Christian community; the most specific tag in its tree first, music
-- context next, then by name. A sub-community names its faith first so
-- everyone can tell what it is: "Jewish (Sephardi)", "Jewish (Chabad)".
-- origin_kind and origin_key say which browse page the credit opens.
--
-- Like song_bylines (migration 230) it has no SET search_path, so it inlines;
-- every object is schema-qualified.

create or replace function public.song_origins(p_song_ids uuid[])
returns table (song_id uuid, origin text, origin_kind text, origin_key text)
language sql stable
as $$
  with recursive ids as (
    select distinct unnest(p_song_ids) as id
  ),
  tagged as (
    select st.song_id, st.context, t.id, t.name, t.type
    from ids join public.song_tags st on st.song_id = ids.id join public.tags t on t.id = st.tag_id
    where t.type in ('community', 'culture')
  ),
  -- Each tagged tag and its ancestors, counting the steps up.
  up as (
    select d.id as tag_id, d.id as at_id, 0 as hops from (select distinct id from tagged) d
    union all
    select up.tag_id, r.related_tag_id, up.hops + 1
    from up join public.tag_relations r on r.tag_id = up.at_id and r.kind = 'parent'
    where up.hops < 10
  ),
  lineage as (
    select distinct on (up.tag_id) up.tag_id, up.hops as depth, rt.name as root_name
    from up join public.tags rt on rt.id = up.at_id
    order by up.tag_id, up.hops desc
  ),
  picked as (
    select distinct on (tg.song_id) tg.song_id, tg.name, tg.type, l.depth, l.root_name
    from tagged tg join lineage l on l.tag_id = tg.id
    order by tg.song_id,
      case when tg.type = 'community' and l.root_name <> 'Christian' then 0
           when tg.type = 'culture' then 1
           else 2 end,
      l.depth desc, (tg.context = 'music') desc, tg.name
  )
  select p.song_id,
    case when p.type = 'community' and p.depth > 0 and p.root_name <> 'Christian'
      then p.root_name || ' (' || p.name || ')'
      else p.name end,
    p.type,
    p.name
  from picked p;
$$;

-- song_bylines: as in 230, with its origin from song_origins.
create or replace function public.song_bylines(p_song_ids uuid[])
returns table (song_id uuid, byline text)
language sql stable
as $$
  with ids as (
    select distinct unnest(p_song_ids) as id
  ),
  writers as (
    select w.song_id,
      bool_or(lower(p.name) = 'traditional') as traditional,
      string_agg(distinct p.name, ', ' order by p.name) filter (where lower(p.name) <> 'traditional') as named
    from (
      select sc.song_id, sc.person_id from ids join public.song_composers sc on sc.song_id = ids.id
      union
      select sl.song_id, sl.person_id from ids join public.song_lyricists sl on sl.song_id = ids.id
    ) w
    join public.people p on p.id = w.person_id
    group by w.song_id
  ),
  traditional_form as (
    select distinct st.song_id
    from ids join public.song_tags st on st.song_id = ids.id join public.tags t on t.id = st.tag_id
    where t.type = 'form'
      and t.name in ('Hymn', 'Nigun', 'Zemer', 'Piyyut', 'Psalm setting', 'Liturgical setting', 'Chant', 'Lined hymn', 'Carol')
  )
  select s.id, case
    when coalesce(s.known_by_recording, not (coalesce(w.traditional, false) or f.song_id is not null))
      then coalesce(nullif(trim(s.display_artist), ''), w.named)
    else coalesce(w.named, 'Traditional' || coalesce(' · ' || o.origin, ''))
  end
  from ids
  join public.songs s on s.id = ids.id
  left join writers w on w.song_id = s.id
  left join traditional_form f on f.song_id = s.id
  left join public.song_origins(p_song_ids) o on o.song_id = s.id;
$$;

-- The song page's "Traditional · …" link: which page it opens.
create or replace function public.byline_origin(s public.songs)
returns jsonb
language sql stable
as $$
  select jsonb_build_object('text', o.origin, 'kind', o.origin_kind, 'key', o.origin_key)
  from public.song_origins(array[s.id]) o;
$$;

-- song_cards: as in 232, plus card_identity.origin, origin_kind and origin_key.
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

grant execute on function public.song_origins(uuid[]) to anon, authenticated, service_role;
grant execute on function public.byline_origin(public.songs) to anon, authenticated, service_role;
