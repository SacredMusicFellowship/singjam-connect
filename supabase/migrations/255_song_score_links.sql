-- Migration 255: a song's score (sheet music) and translation links.
--
-- songs.score_url: a score on Dil Beyti, Hymnary, IMSLP, CPDL or MuseScore, or
-- a PDF (the list is enforced by the web app, packages/core isScoreUrl). Ilahis
-- link their Dil Beyti page; hymns can have both a score and an Ultimate Guitar
-- chord chart. Song editors set it; there's no member review queue.
-- songs.translation_url: a translation of the words elsewhere; no text stored.
--
-- save_song (as in 246) saves both when the payload sends them, and
-- my_repertoire returns score_url so a row's chart slot can show the score when
-- there are no chords.

alter table public.songs add column if not exists score_url text;
alter table public.songs add column if not exists translation_url text;
alter table public.songs drop constraint if exists songs_score_url_web;
alter table public.songs add constraint songs_score_url_web check (score_url ~* '^https?://');
alter table public.songs drop constraint if exists songs_translation_url_web;
alter table public.songs add constraint songs_translation_url_web check (translation_url ~* '^https?://');

-- save_song: as in 246, plus fields.score_url and fields.translation_url (left alone when absent).
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
    score_url       = case when f ? 'score_url' then nullif(trim(f->>'score_url'), '') else score_url end,
    translation_url = case when f ? 'translation_url' then nullif(trim(f->>'translation_url'), '') else translation_url end,
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
  if f ? 'notes_source' then
    update public.songs set notes_source = nullif(f->>'notes_source', '') where id = p_song_id and notes is not null;
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

-- my_repertoire: as in 229, plus score_url at the end (a new return column, so drop first).
drop function if exists public.my_repertoire();
create function public.my_repertoire()
returns table (song_id uuid, confidence text, key_note text, updated_at timestamp with time zone, title text, slug text, display_artist text, first_line text, hook text, notes text, vibe text, tonality text, meter text, year integer, composers text[], cultures text[], productions text[], genres text[], languages text[], themes text[], popularity bigint, chord_chart_url text, forms text[], occasions text[], communities text[], byline text, card_identity jsonb, recording_artists jsonb, score_url text)
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
    s.chord_chart_url, t.forms, t.occasions, t.communities, c.byline, c.card_identity, c.recording_artists,
    s.score_url
  from mine m
  join public.songs s on s.id = m.song_id
  join public.song_cards((select a from ids)) c on c.song_id = m.song_id
  join public.song_tag_arrays((select a from ids)) t on t.song_id = m.song_id
  join public.song_years((select a from ids)) y on y.song_id = m.song_id
  order by s.title asc, m.song_id asc;
$$;
revoke all on function public.my_repertoire() from public, anon, authenticated;
grant execute on function public.my_repertoire() to authenticated, service_role;
