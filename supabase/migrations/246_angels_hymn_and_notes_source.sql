-- Migration 246: "Angels We Have Heard on High" corrected, and save_song keeps
-- where applied notes came from.
--
-- 1. save_song takes an optional fields.notes_source ('wikipedia' | 'ai').
--    The editor sends it only when the notes are exactly what a review
--    suggested; songs_clear_notes_source (migration 239) would otherwise clear
--    it, so it is set in a second update once the notes are saved.
--
-- 2. The carol, added from a set list on 2026-11-19, was described by its
--    for KING & COUNTRY recording (genres Pop and Contemporary Christian, vibe
--    Banger), credited its English words to "Traditional", and took the tune's
--    name "Gloria" as an alternate title. Sources: Wikipedia "Angels We Have
--    Heard on High"; Hymnary.org text angels_we_have_heard_on_high and tune
--    gloria_french; Julian's Dictionary of Hymnology (via Hymnary).
--    - Words: James Chadwick's free English paraphrase of the French carol
--      "Les Anges dans nos campagnes", first printed in Holy Family Hymns, 1860.
--    - Tune: GLORIA, traditional French carol melody, first printed with
--      "Les Anges dans nos campagnes" in Lambillotte's Choix de cantiques sur
--      des airs nouveaux, 1842; harmonized by Edward Shippen Barnes (The New
--      Church Hymnal, 1937). Meter 7.7.7.7 with refrain.
--    Song credits follow the melody pilot (migration 221): composer
--    Traditional plus the arranger, lyricist the translator.

-- save_song: as in 232, plus fields.notes_source (left alone when absent).
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

insert into public.people (name) values ('James Chadwick'), ('Edward Shippen Barnes') on conflict (name) do nothing;

do $$
declare
  sid constant uuid := 'a797ddd1-0b07-48be-8286-5f020670c89a';
  tid uuid;
  uid uuid;
begin
  -- Production only: the song exists nowhere else.
  if not exists (select 1 from public.songs where id = sid and text_id is null and tune_id is null) then return; end if;

  insert into public.texts (title, slug, kind, first_line, notes, year, year_precision)
  values ('Angels We Have Heard on High', 'x', 'hymn', 'Angels we have heard on high, sweetly singing o''er the plains',
          'A free English paraphrase of the French carol "Les Anges dans nos campagnes".', 1860, 'exact')
  returning id into tid;
  insert into public.text_credits (text_id, person_id, role) values (tid, (select id from public.people where name = 'James Chadwick'), 'translator');
  insert into public.text_sources (text_id, corpus, book, chapter_start, verse_start, verse_end, relation)
  values (tid, 'new_testament', 'Luke', 2, 8, 15, 'inspired');
  insert into public.text_tags (text_id, tag_id) select tid, id from public.tags where (type, name) in (('community', 'Christian'), ('language', 'English')) on conflict do nothing;

  insert into public.tunes (name, slug, meter, notes, year, year_precision, published_in)
  values ('Gloria', 'x', '7.7.7.7 with refrain', 'French carol melody, harmonized by Edward Shippen Barnes (The New Church Hymnal, 1937).',
          1842, 'exact', 'Choix de cantiques sur des airs nouveaux')
  returning id into uid;
  insert into public.tune_credits (tune_id, person_id, role) values
    (uid, (select id from public.people where name = 'Traditional'), 'composer'),
    (uid, (select id from public.people where name = 'Edward Shippen Barnes'), 'arranger');
  insert into public.tune_tags (tune_id, tag_id) select uid, id from public.tags where type = 'culture' and name = 'French' on conflict do nothing;

  update public.songs set
    title = 'Angels We Have Heard on High',
    text_id = tid,
    tune_id = uid,
    vibe = null,
    notes_source = 'ai',
    updated_at = now()
  where id = sid;

  delete from public.song_lyricists where song_id = sid;
  insert into public.song_lyricists (song_id, person_id) select sid, id from public.people where name = 'James Chadwick';
  insert into public.song_composers (song_id, person_id) select sid, id from public.people where name = 'Edward Shippen Barnes' on conflict do nothing;

  delete from public.song_tags st using public.tags t
  where st.song_id = sid and st.tag_id = t.id and st.context = 'general'
    and (t.type, t.name) in (('genre', 'Pop'), ('genre', 'Contemporary Christian'), ('theme', 'Faith'));

  delete from public.song_alternate_titles where song_id = sid and title = 'Gloria';
end $$;
