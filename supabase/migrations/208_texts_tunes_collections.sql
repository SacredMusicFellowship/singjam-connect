-- Migration 208: texts, tunes and songbooks (PR 4 of the song catalogue plan).
--
-- A song stays what people know and match on, and can now say which TEXT it
-- sings to which TUNE:
--   texts       words: title, first line, kind (scripture, liturgy, poem, hymn,
--               lyric), with other titles (transliterations, translations),
--               writers (author, translator, adapter), tags (language,
--               community…) and sources: scripture by book/chapter/verse, or
--               any other source by citation (the Masnavi, a siddur).
--   tunes       melodies: an optional name (NETTLETON), poetic meter
--               (8.7.8.7 D), whether it's a fixed melody or a mode to sing in
--               (a raga or maqam with no set tune), a reference recording to
--               know it by ear, writers (composer, arranger) and tags
--               (community, mode, rhythm). Most tunes have no name: a tune is
--               known by its composer or community (tune_label()).
--   collections songbooks, hymnals, tunebooks, siddurim, benchers, standard
--               lists and catalogues, with numbered/paged entries pointing at a
--               song, text or tune (Rise Up Singing p. 123, Sacred Harp 1991
--               p. 47, Zahn 7377, the Polecats).
--   songs.text_id / songs.tune_id   both optional; most pop songs use neither.
-- Two new tag types: mode (maqam, raga, Jewish prayer modes, Orthodox tones)
-- and rhythm (tala, iqa), because in Sufi, Arabic and Indian practice the
-- starting point is a mode, not a fixed tune (Ben, 2026-11-07).
-- The four empty tables made in the dashboard without a migration
-- (song_titles, song_first_lines, song_credits, recordings) are dropped.

-- 1. Tag types --------------------------------------------------------------------
alter table public.tags drop constraint if exists tags_type_check;
alter table public.tags add constraint tags_type_check
  check (type in ('genre', 'theme', 'culture', 'language', 'form', 'occasion', 'community', 'mode', 'rhythm'));

-- 2. Slugs for the new tables ----------------------------------------------------
create or replace function public.next_free_slug(p_table text, p_base text, p_id uuid)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  base text := coalesce(nullif(p_base, ''), 'x');
  candidate text := base;
  n int := 1;
  taken boolean;
begin
  if p_table not in ('people', 'artists', 'productions', 'texts', 'tunes', 'collections') then
    raise exception 'next_free_slug: unsupported table %', p_table;
  end if;
  loop
    execute format('select exists (select 1 from public.%I where slug = $1 and id <> $2)', p_table) into taken using candidate, p_id;
    exit when not taken;
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end;
$$;

-- Texts slug from the title, collections from name + edition, tunes from the
-- name or (unnamed) a short id the editor can rename later.
create or replace function public.catalog_row_slug()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  r jsonb := to_jsonb(new);
  base text;
begin
  if tg_op = 'UPDATE' and new.slug is not null
     and (r->>'title') is not distinct from (to_jsonb(old)->>'title')
     and (r->>'name') is not distinct from (to_jsonb(old)->>'name')
     and (r->>'edition') is not distinct from (to_jsonb(old)->>'edition') then
    return new;
  end if;
  base := case tg_table_name
    when 'texts' then public.tag_slug(r->>'title')
    when 'collections' then public.tag_slug(concat_ws(' ', r->>'name', r->>'edition'))
    else coalesce(nullif(public.tag_slug(r->>'name'), ''), 'tune-' || left(new.id::text, 8))
  end;
  new.slug := public.next_free_slug(tg_table_name, base, new.id);
  return new;
end;
$$;

-- 3. Tables -------------------------------------------------------------------------
create table if not exists public.texts (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  title      text not null check (trim(title) <> ''),
  first_line text,
  kind       text check (kind in ('scripture', 'liturgy', 'poem', 'hymn', 'lyric')),
  notes      text,
  created_at timestamptz not null default now()
);

create table if not exists public.text_titles (
  id      uuid primary key default gen_random_uuid(),
  text_id uuid not null references public.texts(id) on delete cascade,
  title   text not null check (trim(title) <> ''),
  kind    text not null default 'alternate' check (kind in ('alternate', 'transliteration', 'translation')),
  unique (text_id, title)
);

create table if not exists public.text_credits (
  text_id   uuid not null references public.texts(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  role      text not null default 'author' check (role in ('author', 'translator', 'adapter')),
  primary key (text_id, person_id, role)
);

create table if not exists public.text_tags (
  text_id uuid not null references public.texts(id) on delete cascade,
  tag_id  uuid not null references public.tags(id) on delete cascade,
  primary key (text_id, tag_id)
);

-- Scripture is stored in Hebrew (Masoretic) numbering; the apps convert to the
-- Greek/Latin numbering (most of Psalms 9–147 one lower) where a tradition uses it.
create table if not exists public.text_sources (
  id            uuid primary key default gen_random_uuid(),
  text_id       uuid not null references public.texts(id) on delete cascade,
  corpus        text not null check (corpus in ('tanakh', 'new_testament', 'apocrypha', 'quran', 'liturgy', 'other')),
  book          text,
  chapter_start int,
  verse_start   int,
  chapter_end   int,
  verse_end     int,
  citation      text,
  relation      text not null default 'quoted' check (relation in ('quoted', 'paraphrase', 'metrical', 'inspired')),
  check (book is not null or citation is not null)
);
create index if not exists text_sources_text_idx on public.text_sources (text_id);
create index if not exists text_sources_book_idx on public.text_sources (corpus, book, chapter_start);

create table if not exists public.tunes (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  name           text,
  meter          text,
  fixed_melody   boolean not null default true,
  year           int,
  recording_url  text,
  notes          text,
  created_at     timestamptz not null default now()
);

create table if not exists public.tune_credits (
  tune_id   uuid not null references public.tunes(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  role      text not null default 'composer' check (role in ('composer', 'arranger', 'adapter')),
  primary key (tune_id, person_id, role)
);

create table if not exists public.tune_tags (
  tune_id uuid not null references public.tunes(id) on delete cascade,
  tag_id  uuid not null references public.tags(id) on delete cascade,
  primary key (tune_id, tag_id)
);

create table if not exists public.collections (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null check (trim(name) <> ''),
  edition    text,
  kind       text not null check (kind in ('songbook', 'hymnal', 'tunebook', 'siddur', 'bencher', 'standard_list', 'catalogue')),
  publisher  text,
  year       int,
  notes      text,
  created_at timestamptz not null default now()
);

create table if not exists public.collection_entries (
  id               uuid primary key default gen_random_uuid(),
  collection_id    uuid not null references public.collections(id) on delete cascade,
  number           text,
  page             text,
  title_as_printed text,
  song_id          uuid references public.songs(id) on delete cascade,
  text_id          uuid references public.texts(id) on delete cascade,
  tune_id          uuid references public.tunes(id) on delete cascade,
  check (num_nonnulls(song_id, text_id, tune_id) = 1)
);
create index if not exists collection_entries_collection_idx on public.collection_entries (collection_id, number, page);
create index if not exists collection_entries_song_idx on public.collection_entries (song_id);

alter table public.songs add column if not exists text_id uuid references public.texts(id) on delete set null;
alter table public.songs add column if not exists tune_id uuid references public.tunes(id) on delete set null;
create unique index if not exists songs_text_tune_key on public.songs (text_id, tune_id) where text_id is not null and tune_id is not null;
create index if not exists songs_tune_idx on public.songs (tune_id);

do $$
declare tbl text;
begin
  foreach tbl in array array['texts', 'tunes', 'collections'] loop
    execute format('drop trigger if exists %I on public.%I', tbl || '_slug', tbl);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.catalog_row_slug()', tbl || '_slug', tbl);
  end loop;
end $$;

-- 4. Access: everyone reads; admins and song editors write (as song_tags) -----------
do $$
declare tbl text;
begin
  foreach tbl in array array['texts', 'text_titles', 'text_credits', 'text_tags', 'text_sources', 'tunes', 'tune_credits', 'tune_tags', 'collections', 'collection_entries'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || ' are public', tbl);
    execute format('create policy %I on public.%I for select using (true)', tbl || ' are public', tbl);
    execute format('drop policy if exists %I on public.%I', 'admin and song editor write ' || tbl, tbl);
    execute format($p$create policy %I on public.%I for all
      using (exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('admin', 'song_editor')))
      with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('admin', 'song_editor')))$p$,
      'admin and song editor write ' || tbl, tbl);
  end loop;
end $$;

grant select on public.texts to anon;
grant select, insert, update, delete on public.texts to authenticated;
grant select, insert, update, delete on public.texts to service_role;
grant select on public.text_titles to anon;
grant select, insert, update, delete on public.text_titles to authenticated;
grant select, insert, update, delete on public.text_titles to service_role;
grant select on public.text_credits to anon;
grant select, insert, update, delete on public.text_credits to authenticated;
grant select, insert, update, delete on public.text_credits to service_role;
grant select on public.text_tags to anon;
grant select, insert, update, delete on public.text_tags to authenticated;
grant select, insert, update, delete on public.text_tags to service_role;
grant select on public.text_sources to anon;
grant select, insert, update, delete on public.text_sources to authenticated;
grant select, insert, update, delete on public.text_sources to service_role;
grant select on public.tunes to anon;
grant select, insert, update, delete on public.tunes to authenticated;
grant select, insert, update, delete on public.tunes to service_role;
grant select on public.tune_credits to anon;
grant select, insert, update, delete on public.tune_credits to authenticated;
grant select, insert, update, delete on public.tune_credits to service_role;
grant select on public.tune_tags to anon;
grant select, insert, update, delete on public.tune_tags to authenticated;
grant select, insert, update, delete on public.tune_tags to service_role;
grant select on public.collections to anon;
grant select, insert, update, delete on public.collections to authenticated;
grant select, insert, update, delete on public.collections to service_role;
grant select on public.collection_entries to anon;
grant select, insert, update, delete on public.collection_entries to authenticated;
grant select, insert, update, delete on public.collection_entries to service_role;

-- 5. How a tune is known: its name, else its composers, else its community, else
--    its mode (a raga or maqam), else "Traditional".
create or replace function public.tune_label(t public.tunes)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    nullif(trim(t.name), ''),
    (select string_agg(p.name, ', ' order by p.name) from public.tune_credits c join public.people p on p.id = c.person_id
      where c.tune_id = t.id and c.role = 'composer' and lower(p.name) <> 'traditional'),
    (select string_agg(tg.name, ', ' order by tg.name) from public.tune_tags tt join public.tags tg on tg.id = tt.tag_id
      where tt.tune_id = t.id and tg.type = 'community'),
    (select string_agg(tg.name, ', ' order by tg.name) from public.tune_tags tt join public.tags tg on tg.id = tt.tag_id
      where tt.tune_id = t.id and tg.type = 'mode'),
    'Traditional'
  );
$$;
grant execute on function public.tune_label(public.tunes) to anon, authenticated, service_role;

-- 6. Modes and rhythms ---------------------------------------------------------------
create function pg_temp.t(p_type text, p_name text, p_top boolean default false)
returns uuid language plpgsql as $$
declare v uuid;
begin
  select id into v from public.tags where type = p_type and lower(name) = lower(p_name);
  if v is null then
    insert into public.tags (type, name, slug, is_top_level) values (p_type, p_name, public.tag_slug(p_name), p_top) returning id into v;
  end if;
  return v;
end $$;
create function pg_temp.under(p_type text, p_parent text, p_children text[])
returns void language plpgsql as $$
declare c text; parent uuid := pg_temp.t(p_type, p_parent, true);
begin
  foreach c in array p_children loop
    insert into public.tag_relations (tag_id, related_tag_id, kind) values (pg_temp.t(p_type, c), parent, 'parent') on conflict do nothing;
  end loop;
end $$;

select pg_temp.under('mode', 'Maqam', array['Rast', 'Bayati', 'Hijaz', 'Saba', 'Nahawand', 'Kurd', 'Ajam', 'Sikah']);
select pg_temp.under('mode', 'Raga', array['Yaman', 'Bhairav', 'Bhairavi', 'Darbari', 'Kafi', 'Khamaj', 'Desh', 'Malkauns']);
select pg_temp.under('mode', 'Jewish prayer modes', array['Adonai Malach', 'Magen Avot', 'Ahavah Rabbah']);
select pg_temp.under('mode', 'Orthodox tones', array['Tone 1', 'Tone 2', 'Tone 3', 'Tone 4', 'Tone 5', 'Tone 6', 'Tone 7', 'Tone 8']);
select pg_temp.under('rhythm', 'Tala', array['Teentaal', 'Rupak', 'Keherwa', 'Dadra', 'Jhaptaal']);
select pg_temp.under('rhythm', 'Iqa', array['Maqsum', 'Masmoudi', 'Wahda', 'Ayoub', 'Saidi', 'Baladi']);
insert into public.tag_relations (tag_id, related_tag_id, kind)
select (select id from public.tags where type = 'mode' and name = 'Maqam'), (select id from public.tags where type = 'community' and name = 'Sufi'), 'related'
on conflict do nothing;
insert into public.tag_relations (tag_id, related_tag_id, kind)
select (select id from public.tags where type = 'mode' and name = 'Raga'), (select id from public.tags where type = 'genre' and name = 'Kirtan'), 'related'
on conflict do nothing;

-- 7. Pilot: the three hymns whose tune names were stored as alternate titles, and
--    Hinei Ma Tov's text (Psalm 133:1). Their song rows, My songs entries and
--    links stay exactly as they are; they just gain a text and a tune.
create function pg_temp.person(p_name text) returns uuid language plpgsql as $$
declare v uuid;
begin
  select id into v from public.people where name = p_name order by created_at limit 1;
  if v is null then insert into public.people (name) values (p_name) returning id into v; end if;
  return v;
end $$;

do $$
declare txt uuid; tune uuid; song uuid;
begin
  -- Amazing Grace: words John Newton (1779), sung to NEW BRITAIN (Common Meter)
  select id into song from public.songs where title = 'Amazing Grace' order by created_at limit 1;
  if song is not null then
    insert into public.texts (title, slug, first_line, kind) values ('Amazing Grace', 'x', 'Amazing grace! How sweet the sound', 'hymn') returning id into txt;
    insert into public.text_credits (text_id, person_id) values (txt, pg_temp.person('John Newton'));
    insert into public.text_sources (text_id, corpus, book, chapter_start, verse_start, verse_end, relation)
      values (txt, 'tanakh', '1 Chronicles', 17, 16, 17, 'inspired');
    insert into public.tunes (name, slug, meter, notes) values ('New Britain', 'x', 'CM (8.6.8.6)', 'American folk melody, first printed in 1829.') returning id into tune;
    insert into public.tune_credits (tune_id, person_id) values (tune, pg_temp.person('Traditional'));
    update public.songs set text_id = txt, tune_id = tune where id = song;
  end if;

  -- Come Thou Fount: words Robert Robinson (1758), sung to NETTLETON (8.7.8.7 D)
  select id into song from public.songs where title = 'Come Thou Fount of Every Blessing' order by created_at limit 1;
  if song is not null then
    insert into public.texts (title, slug, first_line, kind) values ('Come Thou Fount of Every Blessing', 'x', 'Come, thou Fount of every blessing', 'hymn') returning id into txt;
    insert into public.text_credits (text_id, person_id) values (txt, pg_temp.person('Robert Robinson'));
    insert into public.text_sources (text_id, corpus, book, chapter_start, verse_start, relation)
      values (txt, 'tanakh', '1 Samuel', 7, 12, 'inspired');
    insert into public.tunes (name, slug, meter, notes) values ('Nettleton', 'x', '8.7.8.7 D', 'American melody, first printed in Wyeth''s Repository of Sacred Music, Part Second (1813).') returning id into tune;
    update public.songs set text_id = txt, tune_id = tune where id = song;
  end if;

  -- Be Thou My Vision: Old Irish words (tr. Mary Byrne, versified Eleanor Hull), sung to SLANE
  select id into song from public.songs where title = 'Be Thou My Vision' order by created_at limit 1;
  if song is not null then
    insert into public.texts (title, slug, first_line, kind, notes)
      values ('Be Thou My Vision', 'x', 'Be thou my vision, O Lord of my heart', 'hymn', 'Old Irish poem; translated by Mary Byrne (1905) and versified by Eleanor Hull (1912).') returning id into txt;
    insert into public.text_tags (text_id, tag_id) select txt, id from public.tags where type = 'culture' and name = 'Irish';
    insert into public.tunes (name, slug, notes) values ('Slane', 'x', 'Irish folk melody.') returning id into tune;
    insert into public.tune_credits (tune_id, person_id) values (tune, pg_temp.person('Traditional'));
    insert into public.tune_tags (tune_id, tag_id) select tune, id from public.tags where type = 'culture' and name = 'Irish';
    update public.songs set text_id = txt, tune_id = tune where id = song;
  end if;

  -- Hinei Ma Tov: the words are Psalm 133:1; its many melodies come with the pilot data.
  select id into song from public.songs where title = 'Hinei Ma Tov' order by created_at limit 1;
  if song is not null then
    insert into public.texts (title, slug, first_line, kind) values ('Hinei Ma Tov', 'x', 'Hinei ma tov u-ma na''im', 'scripture') returning id into txt;
    insert into public.text_titles (text_id, title, kind) values (txt, 'Hineh Mah Tov', 'transliteration'), (txt, 'How good and pleasant', 'translation');
    insert into public.text_tags (text_id, tag_id) select txt, id from public.tags where (type = 'language' and name = 'Hebrew') or (type = 'community' and name = 'Jewish');
    insert into public.text_sources (text_id, corpus, book, chapter_start, verse_start, relation) values (txt, 'tanakh', 'Psalms', 133, 1, 'quoted');
    update public.songs set text_id = txt where id = song;
  end if;
end $$;

-- 8. The empty dashboard-made tables, and the unused view built on recordings ---------
drop view if exists public.song_display_artist;
drop table if exists public.song_titles;
drop table if exists public.song_first_lines;
drop table if exists public.song_credits;
drop table if exists public.recordings;
