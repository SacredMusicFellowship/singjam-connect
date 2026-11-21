-- Set-based song helpers. The per-song helpers (song_card_fields, byline,
-- song_tag_names, song_year_span, song_card_identity) ran once per row, and a
-- SQL function with SET search_path is never inlined, so every call paid its
-- own planning: song_melodies took 2.9 s, the set Add-songs lists ~2 s,
-- song_filter_meta 1 s. These take a list of song ids and answer for all of
-- them in one query; every song-list RPC now builds on them (migration 229).

create index if not exists songs_text_idx on public.songs (text_id);

-- Which songs belong to a tag: the tag or any tag below it, on the song itself
-- or on its tune or text. One row per (tag, song); null = every tag.
create or replace function public.tag_song_pairs(p_tag_ids uuid[] default null)
returns table (tag_id uuid, song_id uuid)
language sql stable
set search_path to 'public'
as $$
  with recursive below(ancestor, tag_id) as (
    select id, id from public.tags where p_tag_ids is null or id = any(p_tag_ids)
    union
    select b.ancestor, r.tag_id from below b join public.tag_relations r on r.related_tag_id = b.tag_id and r.kind = 'parent'
  ),
  direct(tag_id, song_id) as (
    select st.tag_id, st.song_id from public.song_tags st
    union
    select tt.tag_id, s.id from public.tune_tags tt join public.songs s on s.tune_id = tt.tune_id
    union
    select xt.tag_id, s.id from public.text_tags xt join public.songs s on s.text_id = xt.text_id
  )
  select distinct b.ancestor, d.song_id
  from below b join direct d on d.tag_id = b.tag_id;
$$;

grant execute on function public.tag_song_pairs(uuid[]) to anon, authenticated, service_role;

create or replace function public.tag_song_counts()
returns table (tag_id uuid, songs integer)
language sql stable
set search_path to 'public'
as $$
  select p.tag_id, count(*)::int from public.tag_song_pairs(null) p group by p.tag_id;
$$;

-- The cultures of traditional songs, with how many each has (Browse hub).
create or replace function public.traditional_culture_counts()
returns table (name text, slug text, song_count bigint)
language sql stable
set search_path to 'public'
as $$
  with trad as (
    select sc.song_id from public.song_composers sc join public.people p on p.id = sc.person_id where p.name = 'Traditional'
    union
    select sl.song_id from public.song_lyricists sl join public.people p on p.id = sl.person_id where p.name = 'Traditional'
  )
  select t.name, t.slug, count(*)
  from public.tag_song_pairs(null) p
  join trad on trad.song_id = p.song_id
  join public.tags t on t.id = p.tag_id and t.type = 'culture'
  group by t.name, t.slug
  order by count(*) desc, t.name;
$$;

-- A song's date: its earliest origin (text, tune, year written, first
-- recording), each as a year_span by its precision. null = every song.
create or replace function public.song_years(p_song_ids uuid[] default null)
returns table (song_id uuid, span int4range)
language sql stable
set search_path to 'public'
as $$
  select s.id, (
    select v.r from (values
      (public.year_span(x.year, x.year_precision)),
      (public.year_span(t.year, t.year_precision)),
      (public.year_span(s.year_written, 'exact')),
      (public.year_span((select min(sra.year) from public.song_recording_artists sra where sra.song_id = s.id), 'exact'))
    ) v(r)
    where v.r is not null
    order by lower(v.r), upper(v.r)
    limit 1)
  from public.songs s
  left join public.texts x on x.id = s.text_id
  left join public.tunes t on t.id = s.tune_id
  where p_song_ids is null or s.id = any(p_song_ids);
$$;

-- A song's own tags by type, names sorted. null = every song.
create or replace function public.song_tag_arrays(p_song_ids uuid[] default null)
returns table (song_id uuid, genres text[], languages text[], themes text[], cultures text[], forms text[], occasions text[], communities text[])
language sql stable
set search_path to 'public'
as $$
  select
    s.id,
    coalesce(g.genres, '{}'), coalesce(g.languages, '{}'), coalesce(g.themes, '{}'), coalesce(g.cultures, '{}'),
    coalesce(g.forms, '{}'), coalesce(g.occasions, '{}'), coalesce(g.communities, '{}')
  from public.songs s
  left join (
    select
      st.song_id,
      array_agg(distinct t.name order by t.name) filter (where t.type = 'genre') as genres,
      array_agg(distinct t.name order by t.name) filter (where t.type = 'language') as languages,
      array_agg(distinct t.name order by t.name) filter (where t.type = 'theme') as themes,
      array_agg(distinct t.name order by t.name) filter (where t.type = 'culture') as cultures,
      array_agg(distinct t.name order by t.name) filter (where t.type = 'form') as forms,
      array_agg(distinct t.name order by t.name) filter (where t.type = 'occasion') as occasions,
      array_agg(distinct t.name order by t.name) filter (where t.type = 'community') as communities
    from public.song_tags st
    join public.tags t on t.id = st.tag_id
    where p_song_ids is null or st.song_id = any(p_song_ids)
    group by st.song_id
  ) g on g.song_id = s.id
  where p_song_ids is null or s.id = any(p_song_ids);
$$;

-- The line under a song's title (migration 204): its recording artists when
-- it's known by a recording, else its writers, else "Traditional · <origin>".
-- Known by a recording unless songs.known_by_recording says otherwise, or a
-- writer is Traditional, or it has a traditional form.
create or replace function public.song_bylines(p_song_ids uuid[])
returns table (song_id uuid, byline text)
language sql stable
set search_path to 'public'
as $$
  with recursive christian as (
    select id from public.tags where type = 'community' and name = 'Christian'
    union
    select r.tag_id from public.tag_relations r join christian c on r.related_tag_id = c.id where r.kind = 'parent'
  ),
  writers as (
    select w.song_id,
      bool_or(lower(p.name) = 'traditional') as traditional,
      string_agg(distinct p.name, ', ' order by p.name) filter (where lower(p.name) <> 'traditional') as named
    from (
      select sc.song_id, sc.person_id from public.song_composers sc where sc.song_id = any(p_song_ids)
      union
      select sl.song_id, sl.person_id from public.song_lyricists sl where sl.song_id = any(p_song_ids)
    ) w
    join public.people p on p.id = w.person_id
    group by w.song_id
  ),
  traditional_form as (
    select distinct st.song_id
    from public.song_tags st join public.tags t on t.id = st.tag_id
    where st.song_id = any(p_song_ids) and t.type = 'form'
      and t.name in ('Hymn', 'Nigun', 'Zemer', 'Piyyut', 'Psalm setting', 'Liturgical setting', 'Chant', 'Lined hymn', 'Carol')
  ),
  -- Where it comes from: a non-Christian community (Jewish), then a culture
  -- (the more specific one first: African American over American), then a
  -- Christian church community; music context first.
  origin as (
    select distinct on (st.song_id) st.song_id, t.name
    from public.song_tags st join public.tags t on t.id = st.tag_id
    where st.song_id = any(p_song_ids) and t.type in ('community', 'culture')
    order by st.song_id,
      case when t.type = 'community' and t.id not in (select id from christian) then 0
           when t.type = 'culture' then 1
           else 2 end,
      t.is_top_level, (st.context = 'music') desc, t.name
  )
  select s.id, case
    when coalesce(s.known_by_recording, not (coalesce(w.traditional, false) or f.song_id is not null))
      then coalesce(nullif(trim(s.display_artist), ''), w.named)
    else coalesce(w.named, 'Traditional' || coalesce(' · ' || o.name, ''))
  end
  from public.songs s
  left join writers w on w.song_id = s.id
  left join traditional_form f on f.song_id = s.id
  left join origin o on o.song_id = s.id
  where s.id = any(p_song_ids);
$$;

-- Kept as songs' computed column (clients select `byline`); the rule lives in song_bylines.
create or replace function public.byline(s public.songs)
returns text
language sql stable
set search_path to 'public'
as $$
  select b.byline from public.song_bylines(array[s.id]) b;
$$;

-- Everything a song card shows besides title and tags: writers, byline,
-- recordings, shows, the one video and Spotify track a card plays (the first
-- recording that has one, else the song's own video), and card_identity
-- (tune, scripture source, first line; migration 211). `card` bundles the
-- fields the compact rows read (set panel, other melodies).
create or replace function public.song_cards(p_song_ids uuid[])
returns table (
  song_id uuid, byline text, composers text[], cultures text[], productions text[],
  recording_artists jsonb, production_credits jsonb, youtube_id text, spotify_track_id text,
  card_identity jsonb, card jsonb
)
language sql stable
set search_path to 'public'
as $$
  select c.*, jsonb_build_object(
    'byline', c.byline, 'composers', c.composers, 'cultures', c.cultures,
    'recording_artists', c.recording_artists, 'card_identity', c.card_identity)
  from (
    select
      s.id as song_id,
      b.byline,
      coalesce((
        select array_agg(n.name order by n.name) from (
          select p.name from public.song_composers sc join public.people p on p.id = sc.person_id where sc.song_id = s.id
          union
          select p.name from public.song_lyricists sl join public.people p on p.id = sl.person_id where sl.song_id = s.id
        ) n), '{}') as composers,
      tg.cultures,
      coalesce((
        select array_agg(pr.name order by pr.name)
        from public.song_productions sp join public.productions pr on pr.id = sp.production_id where sp.song_id = s.id), '{}') as productions,
      (select coalesce(jsonb_agg(jsonb_build_object('name', a.name, 'year', ra.year) order by ra.position nulls last, a.name), '[]'::jsonb)
       from public.song_recording_artists ra join public.artists a on a.id = ra.artist_id
       where ra.song_id = s.id) as recording_artists,
      (select coalesce(jsonb_agg(jsonb_build_object('name', pc.name, 'year', pc.year, 'slug', pc.slug) order by pc.year nulls last, pc.name), '[]'::jsonb)
       from public.song_productions spc join public.productions pc on pc.id = spc.production_id
       where spc.song_id = s.id) as production_credits,
      coalesce(
        (select (regexp_match(sra.youtube_url, '(?:youtu\.be/|[?&]v=|/(?:embed|v|shorts)/)([a-zA-Z0-9_-]{11})'))[1]
         from public.song_recording_artists sra
         where sra.song_id = s.id and sra.youtube_url is not null
         order by sra.position nulls last, sra.artist_id limit 1),
        (regexp_match(s.youtube_url, '(?:youtu\.be/|[?&]v=|/(?:embed|v|shorts)/)([a-zA-Z0-9_-]{11})'))[1]
      ) as youtube_id,
      (select (regexp_match(sra.spotify_url, '/track/([a-zA-Z0-9]+)'))[1]
       from public.song_recording_artists sra
       where sra.song_id = s.id and sra.spotify_url is not null
       order by sra.position nulls last, sra.artist_id limit 1) as spotify_track_id,
      jsonb_build_object(
        'tune', nullif(trim(tu.name), ''),
        'tune_slug', tu.slug,
        'text_slug', tx.slug,
        'source', (
          select jsonb_build_object('book', ts.book, 'chapter_start', ts.chapter_start, 'verse_start', ts.verse_start,
                                    'chapter_end', ts.chapter_end, 'verse_end', ts.verse_end, 'citation', ts.citation,
                                    'relation', ts.relation, 'corpus', ts.corpus)
          from public.text_sources ts
          where ts.text_id = s.text_id and ts.relation <> 'inspired'
          order by array_position(array['quoted', 'metrical', 'paraphrase'], ts.relation), ts.id
          limit 1),
        'first_line', nullif(trim(s.first_line), '')
      ) as card_identity
    from public.songs s
    join public.song_bylines(p_song_ids) b on b.song_id = s.id
    join public.song_tag_arrays(p_song_ids) tg on tg.song_id = s.id
    left join public.tunes tu on tu.id = s.tune_id
    left join public.texts tx on tx.id = s.text_id
    where s.id = any(p_song_ids)
  ) c;
$$;

grant execute on function public.song_years(uuid[]) to anon, authenticated, service_role;
grant execute on function public.song_tag_arrays(uuid[]) to anon, authenticated, service_role;
grant execute on function public.song_bylines(uuid[]) to anon, authenticated, service_role;
grant execute on function public.song_cards(uuid[]) to anon, authenticated, service_role;
