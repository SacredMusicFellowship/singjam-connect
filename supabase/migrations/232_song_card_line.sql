-- Migration 232: the song editor picks what a song card shows under its title.
-- songs.card_line replaces the yes/no "known by" choice on cards with every
-- option: recording artists, writers, tune, scripture, first line or nothing.
-- Null keeps the automatic rule. known_by_recording still decides the song
-- page's byline; the editor sets it from this choice.

alter table public.songs add column if not exists card_line text
  check (card_line in ('recordings', 'writers', 'tune', 'scripture', 'first_line', 'none'));
comment on column public.songs.card_line is
  'What a song card shows under the title: recordings, writers, tune, scripture, first_line or none. Null = automatic.';

-- Songs with a "known by" choice keep the line their cards show now.
update public.songs s set card_line = case
    when s.known_by_recording then 'recordings'
    when s.tune_id is not null then 'tune'
    when exists (select 1 from public.text_sources ts where ts.text_id = s.text_id and ts.relation <> 'inspired') then 'scripture'
    when nullif(trim(s.first_line), '') is not null then 'first_line'
    else 'none'
  end
where s.known_by_recording is not null and s.card_line is null;

-- save_song: as in 209, plus fields.card_line (left alone when absent).
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
    card_line       = case when f ? 'card_line' then nullif(f->>'card_line', '') else card_line end,
    text_id         = case when f ? 'text_id' then nullif(f->>'text_id', '')::uuid else text_id end,
    tune_id         = case when f ? 'tune_id' then nullif(f->>'tune_id', '')::uuid else tune_id end,
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

-- song_cards: as in 230, plus card_identity.line (songs.card_line).
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
        'line', s.card_line
      ) as card_identity
    from ids
    join public.songs s on s.id = ids.id
    join public.song_bylines(p_song_ids) b on b.song_id = s.id
    join public.song_tag_arrays(p_song_ids) tg on tg.song_id = s.id
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
