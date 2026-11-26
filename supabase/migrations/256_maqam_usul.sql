-- Migration 256: a song's maqam and usul, shown on its card.
--
-- Decided with Duygu (Asana 1220646543286091, 2026-11-25): the maqam and usul
-- belong to the song (song_tags, types mode and rhythm), one of each; any song
-- can have them; song editors set them. Turkish and Arabic maqam names are one
-- list: Turkish names lead (plain spelling, no circumflexes) and the Arabic
-- names stay as aliases, so search finds either.
--
-- 1. Maqams: Hijaz, Nahawand, Sikah, Kurd and Ajam take their Turkish names;
--    Uşşak, Hüseyni and Gerdaniye join. (No song has a mode tag yet.)
-- 2. Usul: a new rhythm family with Sofyan, Nim Sofyan, Düyek, Semai, Aksak and
--    Curcuna.
-- 3. Forms Ilahi and Zikr; community Jerrahi under Sufi.
-- 4. save_song (as in 255) accepts mode and rhythm tags.
-- 5. song_cards (as in 234): card_identity gains maqam, maqam_family, usul,
--    usul_family and, for a song with a maqam, poets (its lyricists), because
--    such a card credits the poet alone.

-- 1. Maqams
update public.tags set name = 'Hicaz',    aliases = array['Hijaz', 'Hicâz']        where type = 'mode' and name = 'Hijaz';
update public.tags set name = 'Nihavend', aliases = array['Nahawand', 'Nahavend']  where type = 'mode' and name = 'Nahawand';
update public.tags set name = 'Segah',    aliases = array['Sikah', 'Segâh']        where type = 'mode' and name = 'Sikah';
update public.tags set name = 'Kürdi',    aliases = array['Kurd', 'Kurdi']         where type = 'mode' and name = 'Kurd';
update public.tags set name = 'Acem',     aliases = array['Ajam']                  where type = 'mode' and name = 'Ajam';
update public.tags set aliases = array['Sabâ']   where type = 'mode' and name = 'Saba';
update public.tags set aliases = array['Bayâtî'] where type = 'mode' and name = 'Bayati';

create function pg_temp.tag(p_type text, p_name text, p_aliases text[], p_top boolean default false)
returns uuid language plpgsql as $$
declare v uuid;
begin
  select id into v from public.tags where type = p_type and lower(name) = lower(p_name);
  if v is null then
    insert into public.tags (type, name, slug, is_top_level, aliases)
    values (p_type, p_name, public.tag_slug(p_name), p_top, p_aliases) returning id into v;
  end if;
  return v;
end $$;
create function pg_temp.under(p_child uuid, p_type text, p_parent text)
returns void language sql as $$
  insert into public.tag_relations (tag_id, related_tag_id, kind)
  select p_child, id, 'parent' from public.tags where type = p_type and name = p_parent
  on conflict do nothing;
$$;

select pg_temp.under(pg_temp.tag('mode', 'Uşşak', array['Ussak', 'Ushshaq']), 'mode', 'Maqam');
select pg_temp.under(pg_temp.tag('mode', 'Hüseyni', array['Huseyni', 'Husseini', 'Husayni']), 'mode', 'Maqam');
select pg_temp.under(pg_temp.tag('mode', 'Gerdaniye', array['Gerdâniye']), 'mode', 'Maqam');

-- 2. Usul
select pg_temp.tag('rhythm', 'Usul', array['Usûl'], true);
select pg_temp.under(pg_temp.tag('rhythm', 'Sofyan', array['Sofyân']), 'rhythm', 'Usul');
select pg_temp.under(pg_temp.tag('rhythm', 'Nim Sofyan', array['Nîm Sofyân']), 'rhythm', 'Usul');
select pg_temp.under(pg_temp.tag('rhythm', 'Düyek', array['Duyek']), 'rhythm', 'Usul');
select pg_temp.under(pg_temp.tag('rhythm', 'Semai', array['Semâî', 'Semâi']), 'rhythm', 'Usul');
select pg_temp.under(pg_temp.tag('rhythm', 'Aksak', array[]::text[]), 'rhythm', 'Usul');
select pg_temp.under(pg_temp.tag('rhythm', 'Curcuna', array[]::text[]), 'rhythm', 'Usul');

-- 3. Forms and community
select pg_temp.tag('form', 'Ilahi', array['İlahi', 'İlâhi', 'Ilahiler'], true);
select pg_temp.tag('form', 'Zikr', array['Dhikr', 'Zikir', 'Zekr'], true);
select pg_temp.under(pg_temp.tag('community', 'Jerrahi', array['Cerrahi', 'Halveti-Jerrahi', 'Helveti-Cerrahi']), 'community', 'Sufi');

-- 4. save_song: as in 255, plus mode and rhythm tags.
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
      if ty not in ('genre', 'theme', 'culture', 'language', 'form', 'occasion', 'community', 'mode', 'rhythm') then
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

-- 5. song_cards: as in 234, plus maqam, usul and poets in card_identity.
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
        'origin_key', o.origin_key,
        'maqam', md.name,
        'maqam_family', md.family,
        'usul', rh.name,
        'usul_family', rh.family,
        'poets', case when md.name is not null then
          (select coalesce(jsonb_agg(p.name order by p.name), '[]'::jsonb)
             from public.song_lyricists sl join public.people p on p.id = sl.person_id where sl.song_id = s.id) end
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
    left join lateral (
      select t.name, (select p.name from public.tag_relations r join public.tags p on p.id = r.related_tag_id
                       where r.tag_id = t.id and r.kind = 'parent' order by p.name limit 1) as family
      from public.song_tags st join public.tags t on t.id = st.tag_id
      where st.song_id = s.id and st.context = 'general' and t.type = 'mode'
      order by t.name limit 1
    ) md on true
    left join lateral (
      select t.name, (select p.name from public.tag_relations r join public.tags p on p.id = r.related_tag_id
                       where r.tag_id = t.id and r.kind = 'parent' order by p.name limit 1) as family
      from public.song_tags st join public.tags t on t.id = st.tag_id
      where st.song_id = s.id and st.context = 'general' and t.type = 'rhythm'
      order by t.name limit 1
    ) rh on true
  )
  select c.*, jsonb_build_object(
    'byline', c.byline, 'composers', c.composers, 'cultures', c.cultures,
    'recording_artists', c.recording_artists, 'card_identity', c.card_identity)
  from cards c;
end;
$$;

grant execute on function public.song_cards(uuid[]) to anon, authenticated, service_role;
