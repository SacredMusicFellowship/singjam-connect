-- Migration 200: the song editor saves through one function, in one
-- transaction. Before, the browser made up to ~20 separate writes (the song,
-- new people/artists/tags/productions, seven join tables); one failing part
-- way left the song half-saved, and two of them ignored errors. save_song
-- does it all or nothing.
--
-- It runs as the caller (security invoker), so the existing row-level rules
-- decide who may save what, exactly as before (admins; song editors per
-- migration 192). Because everything is one transaction, the deferred slug
-- triggers (199) recompute the slug once, from the final data.
--
-- p:
--   fields        { title, display_artist, first_line, hook, notes, genius_url,
--                   chord_chart_url, year, year_written, tonality, meter, vibe }
--   genres, themes, languages, cultures   text[] of names
--   composer_ids, lyricist_ids             uuid[]; composer_names, lyricist_names text[] (new people)
--   music_culture, lyric_culture           culture name or null
--   recordings    [{ artist_id | name, year, youtube_url, spotify_url? }] in order;
--                 spotify_url is only written when the key is present
--   productions   [{ id | null, name, year }]
-- Returns the song's slug after the save. Blank names are skipped; a new
-- genre, theme or culture that the caller may not create fails the save with
-- a clear message instead of being silently dropped.

create or replace function public.lookup_or_create_named(p_table text, p_name text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  found_id uuid;
  clean text := trim(p_name);
begin
  if p_table not in ('genres', 'themes', 'cultures', 'languages', 'people', 'artists') then
    raise exception 'lookup_or_create_named: unsupported table %', p_table;
  end if;
  if clean is null or clean = '' then return null; end if;
  execute format('select id from public.%I where lower(name) = lower($1) order by name limit 1', p_table) into found_id using clean;
  if found_id is not null then return found_id; end if;
  begin
    execute format('insert into public.%I (name) values ($1) returning id', p_table) into found_id using clean;
  exception when insufficient_privilege then
    raise exception 'Only admins can add a new % (%).', rtrim(p_table, 's'), clean using errcode = '42501';
  end;
  return found_id;
end;
$$;

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
  traditional_culture uuid;
  updated int;
  result text;
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
    updated_at      = now()
  where id = p_song_id;
  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'Song not found, or you can''t edit it.' using errcode = '42501';
  end if;

  -- Tags
  select coalesce(array_agg(distinct x) filter (where x is not null), '{}') into ids from (select public.lookup_or_create_named('genres', n) x from jsonb_array_elements_text(coalesce(p->'genres', '[]')) n) t;
  delete from public.song_genres where song_id = p_song_id and genre_id <> all(ids);
  insert into public.song_genres (song_id, genre_id) select p_song_id, x from unnest(ids) x where x is not null on conflict do nothing;

  select coalesce(array_agg(distinct x) filter (where x is not null), '{}') into ids from (select public.lookup_or_create_named('themes', n) x from jsonb_array_elements_text(coalesce(p->'themes', '[]')) n) t;
  delete from public.song_themes where song_id = p_song_id and theme_id <> all(ids);
  insert into public.song_themes (song_id, theme_id) select p_song_id, x from unnest(ids) x where x is not null on conflict do nothing;

  select coalesce(array_agg(distinct x) filter (where x is not null), '{}') into ids from (select public.lookup_or_create_named('languages', n) x from jsonb_array_elements_text(coalesce(p->'languages', '[]')) n) t;
  delete from public.song_languages where song_id = p_song_id and language_id <> all(ids);
  insert into public.song_languages (song_id, language_id) select p_song_id, x from unnest(ids) x where x is not null on conflict do nothing;

  select coalesce(array_agg(distinct x) filter (where x is not null), '{}') into ids from (select public.lookup_or_create_named('cultures', n) x from jsonb_array_elements_text(coalesce(p->'cultures', '[]')) n) t;
  delete from public.song_cultures where song_id = p_song_id and context is null and culture_id <> all(ids);
  insert into public.song_cultures (song_id, culture_id) select p_song_id, x from unnest(ids) x where x is not null on conflict do nothing;

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

  -- Traditional cultures (where the melody / words come from)
  delete from public.song_cultures where song_id = p_song_id and context in ('music', 'lyrics');
  if nullif(trim(p->>'music_culture'), '') is not null then
    select id into traditional_culture from public.cultures where lower(name) = lower(trim(p->>'music_culture')) limit 1;
    if traditional_culture is null then raise exception 'Unknown culture: %', p->>'music_culture' using errcode = '22023'; end if;
    insert into public.song_cultures (song_id, culture_id, context) values (p_song_id, traditional_culture, 'music');
  end if;
  if nullif(trim(p->>'lyric_culture'), '') is not null then
    select id into traditional_culture from public.cultures where lower(name) = lower(trim(p->>'lyric_culture')) limit 1;
    if traditional_culture is null then raise exception 'Unknown culture: %', p->>'lyric_culture' using errcode = '22023'; end if;
    insert into public.song_cultures (song_id, culture_id, context) values (p_song_id, traditional_culture, 'lyrics');
  end if;

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

  -- Let the deferred slug triggers run now, so the slug returned is final.
  set constraints all immediate;
  select slug into result from public.songs where id = p_song_id;
  return result;
end;
$$;

revoke execute on function public.save_song(uuid, jsonb) from public, anon;
grant execute on function public.save_song(uuid, jsonb) to authenticated, service_role;
revoke execute on function public.lookup_or_create_named(text, text) from public, anon;
grant execute on function public.lookup_or_create_named(text, text) to authenticated, service_role;
