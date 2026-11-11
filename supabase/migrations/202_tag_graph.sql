-- Migration 202: one shared tag graph for every song vocabulary.
--
-- Genres, themes, cultures and languages each had their own table and join
-- table, with no way to nest them or link across them. They move into:
--   tags           one row per tag, with a type (genre, theme, culture,
--                  language, form, occasion, community), aliases (old and
--                  alternative names) and whether it shows at the top level
--   tag_relations  tag -> tag links: 'parent' (a tag can have several
--                  parents, e.g. Rockabilly under Rock and Americana) and
--                  'related' (across types, e.g. Klezmer <-> Jewish)
--   song_tags      song -> tag, with a context: 'general', or 'music' /
--                  'lyrics' for where a traditional song's melody or words
--                  come from (was song_cultures.context)
--   jam_tags       jam -> tag (was jam_genres / jam_themes)
-- and gain three new vocabularies: forms, occasions and communities. The
-- lists were reviewed line by line by Ben (2026-11-07).
--
-- Switch-over: the old tables stay for now, kept in step with the new ones by
-- the *_mirror triggers below in both directions, so app code from before
-- this migration keeps working until the new code deploys. A later migration
-- drops the old tables, the mirrors and tag_legacy_map.

-- 1. Tables -----------------------------------------------------------------

create or replace function public.tag_slug(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(both '-' from regexp_replace(
    lower(regexp_replace(normalize(replace(coalesce(p_name, ''), '&', ' and '), NFKD), '[̀-ͯ]', '', 'g')),
    '[^a-z0-9]+', '-', 'g'));
$$;

create table if not exists public.tags (
  id           uuid primary key default gen_random_uuid(),
  type         text not null check (type in ('genre', 'theme', 'culture', 'language', 'form', 'occasion', 'community')),
  name         text not null check (trim(name) <> ''),
  slug         text not null,
  aliases      text[] not null default '{}',
  is_top_level boolean not null default false,
  description  text,
  created_at   timestamptz not null default now(),
  unique (type, slug)
);
create unique index if not exists tags_type_lower_name_key on public.tags (type, lower(name));

create or replace function public.tags_set_slug()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name := trim(new.name);
  if tg_op = 'INSERT' or new.name is distinct from old.name then
    new.slug := public.tag_slug(new.name);
  end if;
  return new;
end;
$$;
drop trigger if exists tags_set_slug on public.tags;
create trigger tags_set_slug before insert or update on public.tags
  for each row execute function public.tags_set_slug();

create table if not exists public.tag_relations (
  tag_id         uuid not null references public.tags(id) on delete cascade,
  related_tag_id uuid not null references public.tags(id) on delete cascade,
  kind           text not null check (kind in ('parent', 'related')),
  primary key (tag_id, related_tag_id, kind),
  check (tag_id <> related_tag_id)
);
comment on table public.tag_relations is
  'kind = parent: related_tag_id is a parent of tag_id. kind = related: a two-way link, stored once.';
create index if not exists tag_relations_related_idx on public.tag_relations (related_tag_id);

create table if not exists public.song_tags (
  song_id uuid not null references public.songs(id) on delete cascade,
  tag_id  uuid not null references public.tags(id) on delete cascade,
  context text not null default 'general' check (context in ('general', 'music', 'lyrics')),
  primary key (song_id, tag_id, context)
);
create index if not exists song_tags_tag_idx on public.song_tags (tag_id);

create table if not exists public.jam_tags (
  jam_id uuid not null references public.jams(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (jam_id, tag_id)
);
create index if not exists jam_tags_tag_idx on public.jam_tags (tag_id);

-- Which old genres/themes/cultures/languages row each tag came from. Only
-- needed while the old tables still exist.
create table if not exists public.tag_legacy_map (
  legacy_table text not null check (legacy_table in ('genres', 'themes', 'cultures', 'languages')),
  legacy_id    uuid not null,
  tag_id       uuid not null references public.tags(id) on delete cascade,
  primary key (legacy_table, legacy_id)
);
create index if not exists tag_legacy_map_tag_idx on public.tag_legacy_map (tag_id);

-- 2. Access -------------------------------------------------------------------

alter table public.tags enable row level security;
alter table public.tag_relations enable row level security;
alter table public.song_tags enable row level security;
alter table public.jam_tags enable row level security;
alter table public.tag_legacy_map enable row level security;

drop policy if exists "tags are public" on public.tags;
create policy "tags are public" on public.tags for select using (true);
drop policy if exists "admin write tags" on public.tags;
create policy "admin write tags" on public.tags for all
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
-- Song editors could already add languages (192); vocabularies stay admin-only otherwise.
drop policy if exists "song editor insert language tags" on public.tags;
create policy "song editor insert language tags" on public.tags for insert
  with check (type = 'language' and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'song_editor'));

drop policy if exists "tag relations are public" on public.tag_relations;
create policy "tag relations are public" on public.tag_relations for select using (true);
drop policy if exists "admin write tag relations" on public.tag_relations;
create policy "admin write tag relations" on public.tag_relations for all
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));

drop policy if exists "song tags are public" on public.song_tags;
create policy "song tags are public" on public.song_tags for select using (true);
drop policy if exists "admin and song editor write song tags" on public.song_tags;
create policy "admin and song editor write song tags" on public.song_tags for all
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('admin', 'song_editor')))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('admin', 'song_editor')));

-- A jam's tags are visible to whoever can see the jam.
drop policy if exists "jam tags follow the jam" on public.jam_tags;
create policy "jam tags follow the jam" on public.jam_tags for select
  using (exists (select 1 from public.jams j where j.id = jam_tags.jam_id));
drop policy if exists "host insert jam tags" on public.jam_tags;
create policy "host insert jam tags" on public.jam_tags for insert
  with check (exists (select 1 from public.jams j where j.id = jam_tags.jam_id and j.host_user_id = (select auth.uid())));
drop policy if exists "host delete jam tags" on public.jam_tags;
create policy "host delete jam tags" on public.jam_tags for delete
  using (exists (select 1 from public.jams j where j.id = jam_tags.jam_id and j.host_user_id = (select auth.uid())));

drop policy if exists "tag legacy map is public" on public.tag_legacy_map;
create policy "tag legacy map is public" on public.tag_legacy_map for select using (true);

grant select on public.tags to anon;
grant select, insert, update, delete on public.tags to authenticated;
grant select, insert, update, delete on public.tags to service_role;
grant select on public.tag_relations to anon;
grant select, insert, update, delete on public.tag_relations to authenticated;
grant select, insert, update, delete on public.tag_relations to service_role;
grant select on public.song_tags to anon;
grant select, insert, update, delete on public.song_tags to authenticated;
grant select, insert, update, delete on public.song_tags to service_role;
grant select on public.jam_tags to anon;
grant select, insert, update, delete on public.jam_tags to authenticated;
grant select, insert, update, delete on public.jam_tags to service_role;
grant select on public.tag_legacy_map to anon;
grant select on public.tag_legacy_map to authenticated;
grant select, insert, update, delete on public.tag_legacy_map to service_role;

-- 3. The vocabularies -----------------------------------------------------------

create function pg_temp.t(p_type text, p_name text, p_top boolean default false, p_aliases text[] default '{}')
returns uuid language plpgsql as $$
declare v uuid;
begin
  select id into v from public.tags where type = p_type and lower(name) = lower(p_name);
  if v is null then
    insert into public.tags (type, name, slug, is_top_level, aliases)
    values (p_type, p_name, public.tag_slug(p_name), p_top, p_aliases) returning id into v;
  else
    update public.tags set is_top_level = is_top_level or p_top,
      aliases = array(select distinct a from unnest(aliases || p_aliases) a)
    where id = v;
  end if;
  return v;
end $$;

create function pg_temp.id(p_type text, p_name text)
returns uuid language plpgsql as $$
declare v uuid;
begin
  select id into v from public.tags where type = p_type and lower(name) = lower(p_name);
  if v is null then raise exception 'migration 202: no % tag named %', p_type, p_name; end if;
  return v;
end $$;

create function pg_temp.under(p_type text, p_parent text, p_children text[])
returns void language plpgsql as $$
declare c text;
begin
  foreach c in array p_children loop
    insert into public.tag_relations (tag_id, related_tag_id, kind)
    values (pg_temp.t(p_type, c), pg_temp.id(p_type, p_parent), 'parent') on conflict do nothing;
  end loop;
end $$;

create function pg_temp.rel(a_type text, a_name text, b_type text, b_name text)
returns void language plpgsql as $$
begin
  insert into public.tag_relations (tag_id, related_tag_id, kind)
  values (pg_temp.id(a_type, a_name), pg_temp.id(b_type, b_name), 'related') on conflict do nothing;
end $$;

-- Old rows that become a differently named or differently typed tag. Every
-- other old row becomes a tag of its own type with the same name.
create temporary table legacy_moves (legacy_table text, legacy_name text, type text, name text) on commit drop;
insert into legacy_moves values
  ('genres',   'Hymns',              'form',      'Hymn'),
  ('genres',   'Lullaby',            'form',      'Lullaby'),
  ('genres',   'Sea Shanties',       'form',      'Shanty'),
  ('genres',   'Child Ballad',       'form',      'Ballad'),
  ('genres',   'Holiday',            'occasion',  'Seasons and holidays'),
  ('genres',   'Musical',            'genre',     'Broadway & Musical Theatre'),
  ('cultures', 'Christian',          'community', 'Christian'),
  ('cultures', 'Catholic',           'community', 'Catholic'),
  ('cultures', 'Protestant',         'community', 'Protestant'),
  ('cultures', 'Jewish',             'community', 'Jewish'),
  ('cultures', 'Rastafarian',        'community', 'Rastafari'),
  ('cultures', 'Hindu',              'community', 'Hindu'),
  ('cultures', 'Buddhist',           'community', 'Buddhist'),
  ('cultures', 'Islamic',            'community', 'Muslim'),
  ('cultures', 'Sufi',               'community', 'Sufi'),
  ('cultures', 'Sikh',               'community', 'Sikh'),
  ('cultures', 'Mormon/LDS',         'community', 'Latter-day Saints'),
  ('cultures', 'Amish',              'community', 'Amish'),
  ('cultures', 'Eastern Orthodox',   'community', 'Orthodox'),
  ('cultures', 'Ethiopian Orthodox', 'community', 'Ethiopian Orthodox'),
  ('cultures', 'Celtic Pagan',       'community', 'Pagan'),
  ('cultures', 'Gregorian',          'form',      'Chant'),
  ('cultures', 'Liturgical',         'form',      'Liturgical setting');

-- Genres
select pg_temp.t('genre', n, true) from unnest(array[
  'Rock', 'Pop', 'Folk', 'Country', 'Americana', 'R&B', 'Latin', 'Caribbean', 'Sacred',
  'Jewish Music', 'Stage & Screen', 'Jazz', 'Blues', 'Hip-Hop & Rap', 'Children''s Music'
]) n;
select pg_temp.under('genre', 'Rock', array['Classic Rock', 'Alternative Rock', 'Indie Rock', 'Hard Rock', 'Psychedelic Rock',
  'Progressive Rock', 'Soft Rock', 'Punk', 'Grunge', 'Emo', 'Metal', 'New Wave', 'Rockabilly', 'Roots Rock', 'Jam Band',
  'Folk Rock', 'Heartland Rock']);
select pg_temp.under('genre', 'Pop', array['Disco', 'Soft Rock', 'New Wave', 'Motown', 'Doo-Wop', 'Afropop']);
select pg_temp.under('genre', 'Folk', array['Folk Rock', 'Celtic', 'Cajun', 'Zydeco', 'Klezmer', 'Israeli Folk', 'Circle Songs']);
select pg_temp.under('genre', 'Country', array['Bluegrass']);
select pg_temp.under('genre', 'Americana', array['Country', 'Bluegrass', 'Roots Rock', 'Rockabilly', 'Folk Rock', 'Cajun', 'Zydeco', 'Heartland Rock']);
select pg_temp.under('genre', 'R&B', array['Soul', 'Motown', 'Funk', 'Doo-Wop']);
select pg_temp.under('genre', 'Latin', array['Bossa Nova', 'Salsa', 'Flamenco']);
select pg_temp.under('genre', 'Caribbean', array['Reggae', 'Ska', 'Calypso']);
select pg_temp.under('genre', 'Sacred', array['Gospel', 'Spiritual', 'Contemporary Christian', 'Qawwali', 'Kirtan', 'Cantorial', 'Contemporary Jewish']);
select pg_temp.under('genre', 'Gospel', array['Traditional Gospel', 'Contemporary Gospel']);
select pg_temp.under('genre', 'Jewish Music', array['Klezmer', 'Israeli Folk', 'Cantorial', 'Contemporary Jewish']);
select pg_temp.under('genre', 'Stage & Screen', array['Broadway & Musical Theatre', 'Film', 'Disney & Animation', 'TV', 'Opera & Operetta']);
select pg_temp.t('genre', 'Broadway & Musical Theatre', false, array['Musical', 'Musicals', 'Broadway', 'Show Tunes']);
select pg_temp.t('genre', 'Hip-Hop & Rap', true, array['Hip-Hop/Rap', 'Hip-Hop', 'Rap']);
select pg_temp.t('genre', 'Children''s Music', true, array['Children/Kids', 'Kids']);
select pg_temp.t('genre', 'Indie Rock', false, array['Indie']);
select pg_temp.t('genre', 'Cantorial', false, array['Hazzanut', 'Chazzanut']);

-- Forms
select pg_temp.t('form', n, true) from unnest(array[
  'Hymn', 'Carol', 'Chant', 'Psalm setting', 'Nigun', 'Zemer', 'Piyyut', 'Ballad', 'Lullaby', 'Shanty', 'Round / Canon',
  'Work song', 'Liturgical setting', 'Worship song', 'Anthem', 'Call and response', 'Lined hymn', 'Lament', 'Mantra',
  'Action song', 'Drinking song', 'Freedom song', 'Circle song'
]) n;
select pg_temp.t('form', 'Hymn', true, array['Hymns']);
select pg_temp.t('form', 'Shanty', true, array['Sea Shanties', 'Sea Shanty']);
select pg_temp.t('form', 'Ballad', true, array['Child Ballad']);
select pg_temp.t('form', 'Round / Canon', true, array['Round', 'Canon']);
select pg_temp.t('form', 'Chant', true, array['Gregorian']);
select pg_temp.t('form', 'Liturgical setting', true, array['Liturgical']);
select pg_temp.t('form', 'Worship song', true, array['Praise chorus']);
select pg_temp.t('form', 'Nigun', true, array['Niggun', 'Nign']);

-- Occasions
select pg_temp.t('occasion', n, true) from unnest(array[
  'Shabbat', 'Jewish holidays', 'Christian year', 'Seasons and holidays', 'Life events', 'Gatherings'
]) n;
select pg_temp.under('occasion', 'Shabbat', array['Friday night (Kabbalat Shabbat)', 'Shabbat table (zemirot)', 'Havdalah']);
select pg_temp.under('occasion', 'Jewish holidays', array['Rosh Hashanah', 'Yom Kippur', 'Sukkot', 'Simchat Torah', 'Hanukkah',
  'Purim', 'Passover', 'Shavuot', 'Tu BiShvat']);
select pg_temp.under('occasion', 'Christian year', array['Advent', 'Christmas', 'Epiphany', 'Lent', 'Holy Week', 'Easter', 'Pentecost']);
select pg_temp.under('occasion', 'Seasons and holidays', array['New Year', 'Thanksgiving', 'Halloween']);
select pg_temp.under('occasion', 'Life events', array['Wedding', 'Funeral and memorial', 'Birthday', 'Baby naming', 'Graduation',
  'Bar/Bat Mitzvah', 'Anniversary']);
select pg_temp.under('occasion', 'Gatherings', array['Campfire', 'Protest and march', 'Summer camp', 'Song circle',
  'Singalong / hootenanny', 'Kumzitz', 'Tisch', 'Hymn sing', 'Worship service', 'Retreat', 'Pub sing', 'Bedside / hospice']);
select pg_temp.t('occasion', 'Seasons and holidays', true, array['Holiday', 'Holidays']);
select pg_temp.t('occasion', 'Shabbat table (zemirot)', false, array['Shabbat table', 'Zemirot']);
select pg_temp.t('occasion', 'Hanukkah', false, array['Chanukah']);

-- Communities
select pg_temp.t('community', n, true) from unnest(array[
  'Jewish', 'Christian', 'Muslim', 'Hindu', 'Buddhist', 'Sikh', 'Rastafari', 'Unitarian Universalist', 'Pagan'
]) n;
select pg_temp.under('community', 'Jewish', array['Ashkenazi', 'Sephardi', 'Mizrahi', 'Jewish movements', 'Neo-Hasidic']);
select pg_temp.under('community', 'Ashkenazi', array['Hasidic']);
select pg_temp.under('community', 'Hasidic', array['Chabad', 'Breslov', 'Modzitz', 'Vizhnitz', 'Ger', 'Bobov', 'Karlin']);
select pg_temp.under('community', 'Mizrahi', array['Moroccan', 'Syrian (Aleppo)', 'Yemenite', 'Iraqi', 'Persian', 'Ethiopian (Beta Israel)']);
select pg_temp.under('community', 'Jewish movements', array['Reform', 'Conservative', 'Modern Orthodox']);
select pg_temp.under('community', 'Neo-Hasidic', array['Carlebach', 'Rising Song (Hadar)', 'Renewal']);
select pg_temp.under('community', 'Christian', array['Catholic', 'Orthodox', 'Protestant', 'Black Church (US)', 'Latter-day Saints']);
select pg_temp.under('community', 'Catholic', array['Roman Catholic', 'Eastern Catholic']);
select pg_temp.under('community', 'Orthodox', array['Greek Orthodox', 'Russian Orthodox', 'Antiochian Orthodox', 'Ethiopian Orthodox', 'Coptic Orthodox']);
select pg_temp.under('community', 'Protestant', array['Anglican/Episcopal', 'Lutheran', 'Reformed/Presbyterian', 'Methodist', 'Baptist',
  'Pentecostal/Charismatic', 'Evangelical', 'Anabaptist', 'Quaker', 'Moravian']);
select pg_temp.under('community', 'Baptist', array['Missionary Baptist', 'Primitive Baptist']);
select pg_temp.under('community', 'Anabaptist', array['Mennonite', 'Amish']);
select pg_temp.under('community', 'Muslim', array['Sufi']);
select pg_temp.t('community', 'Rastafari', true, array['Rastafarian']);
select pg_temp.t('community', 'Muslim', true, array['Islamic']);
select pg_temp.t('community', 'Latter-day Saints', false, array['Mormon/LDS', 'Mormon', 'LDS']);
select pg_temp.t('community', 'Orthodox', false, array['Eastern Orthodox']);
select pg_temp.t('community', 'Pagan', true, array['Celtic Pagan']);
select pg_temp.t('community', 'Chabad', false, array['Lubavitch']);

-- Every old row: moved per legacy_moves, otherwise same name, same type.
insert into public.tag_legacy_map (legacy_table, legacy_id, tag_id)
select 'genres', g.id, pg_temp.t(coalesce(m.type, 'genre'), coalesce(m.name, g.name))
from public.genres g left join legacy_moves m on m.legacy_table = 'genres' and m.legacy_name = g.name
on conflict do nothing;
insert into public.tag_legacy_map (legacy_table, legacy_id, tag_id)
select 'themes', t.id, pg_temp.t('theme', t.name, true) from public.themes t
on conflict do nothing;
insert into public.tag_legacy_map (legacy_table, legacy_id, tag_id)
select 'cultures', c.id, pg_temp.t(coalesce(m.type, 'culture'), coalesce(m.name, c.name), m.type is null)
from public.cultures c left join legacy_moves m on m.legacy_table = 'cultures' and m.legacy_name = c.name
on conflict do nothing;
insert into public.tag_legacy_map (legacy_table, legacy_id, tag_id)
select 'languages', l.id, pg_temp.t('language', l.name, true) from public.languages l
on conflict do nothing;
update public.tags t set aliases = array(select distinct a from unnest(t.aliases || array[m.legacy_name]) a)
from legacy_moves m where t.type = m.type and t.name = m.name and m.legacy_name <> m.name;

-- Genres that only had a parent before the old row was mapped (e.g. Gospel) are
-- not top-level; every old genre that has no parent is.
update public.tags t set is_top_level = true
where t.type = 'genre'
  and not exists (select 1 from public.tag_relations r where r.tag_id = t.id and r.kind = 'parent');

-- Languages
select pg_temp.t('language', n, true) from unnest(array[
  'Yiddish', 'Ladino', 'Latin', 'Aramaic', 'Church Slavonic', 'Greek', 'Arabic', 'German', 'French', 'Italian', 'Irish',
  'Scottish Gaelic', 'Welsh', 'Hawaiian', 'Swahili', 'Zulu', 'Xhosa', 'Russian', 'Polish', 'Swedish', 'Norwegian',
  'Japanese', 'Korean', 'Mandarin'
]) n;

-- Links across types
select pg_temp.rel('genre', 'Klezmer', 'community', 'Jewish');
select pg_temp.rel('form', 'Nigun', 'community', 'Hasidic');
select pg_temp.rel('form', 'Nigun', 'community', 'Neo-Hasidic');
select pg_temp.rel('occasion', 'Shabbat table (zemirot)', 'form', 'Zemer');
select pg_temp.rel('genre', 'Cantorial', 'form', 'Liturgical setting');
select pg_temp.rel('genre', 'Qawwali', 'community', 'Sufi');
select pg_temp.rel('genre', 'Kirtan', 'community', 'Hindu');
select pg_temp.rel('genre', 'Kirtan', 'community', 'Sikh');
select pg_temp.rel('form', 'Lined hymn', 'community', 'Black Church (US)');
select pg_temp.rel('form', 'Lined hymn', 'community', 'Primitive Baptist');
select pg_temp.rel('occasion', 'Kumzitz', 'community', 'Jewish');
select pg_temp.rel('occasion', 'Tisch', 'community', 'Hasidic');
select pg_temp.rel('genre', 'Circle Songs', 'form', 'Circle song');
select pg_temp.rel('genre', 'Circle Songs', 'occasion', 'Song circle');

-- 4. Existing links -----------------------------------------------------------

insert into public.song_tags (song_id, tag_id, context)
select x.song_id, m.tag_id, 'general' from public.song_genres x
join public.tag_legacy_map m on m.legacy_table = 'genres' and m.legacy_id = x.genre_id
on conflict do nothing;
insert into public.song_tags (song_id, tag_id, context)
select x.song_id, m.tag_id, 'general' from public.song_themes x
join public.tag_legacy_map m on m.legacy_table = 'themes' and m.legacy_id = x.theme_id
on conflict do nothing;
insert into public.song_tags (song_id, tag_id, context)
select x.song_id, m.tag_id, 'general' from public.song_languages x
join public.tag_legacy_map m on m.legacy_table = 'languages' and m.legacy_id = x.language_id
on conflict do nothing;
insert into public.song_tags (song_id, tag_id, context)
select x.song_id, m.tag_id, coalesce(x.context, 'general') from public.song_cultures x
join public.tag_legacy_map m on m.legacy_table = 'cultures' and m.legacy_id = x.culture_id
on conflict do nothing;

insert into public.jam_tags (jam_id, tag_id)
select x.jam_id, m.tag_id from public.jam_genres x
join public.tag_legacy_map m on m.legacy_table = 'genres' and m.legacy_id = x.genre_id
on conflict do nothing;
insert into public.jam_tags (jam_id, tag_id)
select x.jam_id, m.tag_id from public.jam_themes x
join public.tag_legacy_map m on m.legacy_table = 'themes' and m.legacy_id = x.theme_id
on conflict do nothing;

-- Profile favourites are genre names. Moved genres follow their nearest
-- genre (Ben's call); old spellings follow their alias.
update public.profiles p set favorite_genres = (
  select array_agg(mapped order by first_ord)
  from (
    select mm.mapped, min(f.ord) as first_ord
    from unnest(p.favorite_genres) with ordinality as f(g, ord)
    cross join lateral (select case f.g
      when 'Hymns'        then 'Sacred'
      when 'Lullaby'      then 'Children''s Music'
      when 'Child Ballad' then 'Folk'
      else coalesce(
        (select t.name from public.tags t where t.type = 'genre' and lower(t.name) = lower(f.g) limit 1),
        (select t.name from public.tags t where t.type = 'genre' and exists (select 1 from unnest(t.aliases) a where lower(a) = lower(f.g)) limit 1),
        f.g)
      end as mapped) mm
    group by mm.mapped
  ) d
)
where p.favorite_genres is not null and cardinality(p.favorite_genres) > 0;

-- 5. Keep old and new tables in step until the old ones are dropped ----------

create or replace function public.legacy_song_tag_mirror()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  legacy text;
  lid uuid;
  t uuid;
  ctx text := 'general';
begin
  if pg_trigger_depth() > 1 then return null; end if;
  case tg_table_name
    when 'song_genres'    then legacy := 'genres';    lid := (r->>'genre_id')::uuid;
    when 'song_themes'    then legacy := 'themes';    lid := (r->>'theme_id')::uuid;
    when 'song_languages' then legacy := 'languages'; lid := (r->>'language_id')::uuid;
    when 'song_cultures'  then legacy := 'cultures';  lid := (r->>'culture_id')::uuid; ctx := coalesce(r->>'context', 'general');
  end case;
  select tag_id into t from public.tag_legacy_map where legacy_table = legacy and legacy_id = lid;
  if t is null then return null; end if;
  if tg_op = 'INSERT' then
    insert into public.song_tags (song_id, tag_id, context) values ((r->>'song_id')::uuid, t, ctx) on conflict do nothing;
  elsif tg_op = 'DELETE' then
    delete from public.song_tags where song_id = (r->>'song_id')::uuid and tag_id = t and context = ctx;
  end if;
  return null;
end;
$$;

do $$
declare tbl text;
begin
  foreach tbl in array array['song_genres', 'song_themes', 'song_languages', 'song_cultures'] loop
    execute format('drop trigger if exists %I on public.%I', tbl || '_tag_mirror', tbl);
    execute format('create trigger %I after insert or delete on public.%I for each row execute function public.legacy_song_tag_mirror()', tbl || '_tag_mirror', tbl);
  end loop;
end $$;

create or replace function public.song_tags_legacy_mirror()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.song_tags := coalesce(new, old);
  m record;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  for m in select legacy_table, legacy_id from public.tag_legacy_map where tag_id = r.tag_id loop
    if tg_op = 'INSERT' then
      case m.legacy_table
        when 'genres' then
          if r.context = 'general' then insert into public.song_genres (song_id, genre_id) values (r.song_id, m.legacy_id) on conflict do nothing; end if;
        when 'themes' then
          if r.context = 'general' then insert into public.song_themes (song_id, theme_id) values (r.song_id, m.legacy_id) on conflict do nothing; end if;
        when 'languages' then
          if r.context = 'general' then insert into public.song_languages (song_id, language_id) values (r.song_id, m.legacy_id) on conflict do nothing; end if;
        when 'cultures' then
          insert into public.song_cultures (song_id, culture_id, context)
          select r.song_id, m.legacy_id, nullif(r.context, 'general')
          where not exists (select 1 from public.song_cultures c where c.song_id = r.song_id and c.culture_id = m.legacy_id
                              and c.context is not distinct from nullif(r.context, 'general'));
      end case;
    else
      case m.legacy_table
        when 'genres'    then delete from public.song_genres    where song_id = r.song_id and genre_id    = m.legacy_id and r.context = 'general';
        when 'themes'    then delete from public.song_themes    where song_id = r.song_id and theme_id    = m.legacy_id and r.context = 'general';
        when 'languages' then delete from public.song_languages where song_id = r.song_id and language_id = m.legacy_id and r.context = 'general';
        when 'cultures'  then delete from public.song_cultures  where song_id = r.song_id and culture_id  = m.legacy_id
                                and context is not distinct from nullif(r.context, 'general');
      end case;
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists song_tags_legacy_mirror on public.song_tags;
create trigger song_tags_legacy_mirror after insert or delete on public.song_tags
  for each row execute function public.song_tags_legacy_mirror();

create or replace function public.legacy_jam_tag_mirror()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  t uuid;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_table_name = 'jam_genres' then
    select tag_id into t from public.tag_legacy_map where legacy_table = 'genres' and legacy_id = (r->>'genre_id')::uuid;
  else
    select tag_id into t from public.tag_legacy_map where legacy_table = 'themes' and legacy_id = (r->>'theme_id')::uuid;
  end if;
  if t is null then return null; end if;
  if tg_op = 'INSERT' then
    insert into public.jam_tags (jam_id, tag_id) values ((r->>'jam_id')::uuid, t) on conflict do nothing;
  else
    delete from public.jam_tags where jam_id = (r->>'jam_id')::uuid and tag_id = t;
  end if;
  return null;
end;
$$;

drop trigger if exists jam_genres_tag_mirror on public.jam_genres;
create trigger jam_genres_tag_mirror after insert or delete on public.jam_genres
  for each row execute function public.legacy_jam_tag_mirror();
drop trigger if exists jam_themes_tag_mirror on public.jam_themes;
create trigger jam_themes_tag_mirror after insert or delete on public.jam_themes
  for each row execute function public.legacy_jam_tag_mirror();

create or replace function public.jam_tags_legacy_mirror()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.jam_tags := coalesce(new, old);
  m record;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  for m in select legacy_table, legacy_id from public.tag_legacy_map where tag_id = r.tag_id and legacy_table in ('genres', 'themes') loop
    if tg_op = 'INSERT' then
      if m.legacy_table = 'genres' then insert into public.jam_genres (jam_id, genre_id) values (r.jam_id, m.legacy_id) on conflict do nothing;
      else insert into public.jam_themes (jam_id, theme_id) values (r.jam_id, m.legacy_id) on conflict do nothing; end if;
    else
      if m.legacy_table = 'genres' then delete from public.jam_genres where jam_id = r.jam_id and genre_id = m.legacy_id;
      else delete from public.jam_themes where jam_id = r.jam_id and theme_id = m.legacy_id; end if;
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists jam_tags_legacy_mirror on public.jam_tags;
create trigger jam_tags_legacy_mirror after insert or delete on public.jam_tags
  for each row execute function public.jam_tags_legacy_mirror();

-- 6. Slugs: the music culture now comes from song_tags ------------------------

create or replace function public.song_slug_base(p_song_id uuid, p_title text)
returns text
language sql
stable
set search_path = public
as $$
  select nullif(
    regexp_replace(
      trim(regexp_replace(
        lower(regexp_replace(regexp_replace(normalize(concat_ws(' ',
          p_title,
          (select string_agg(w.name, ' ' order by lower(w.name))
             from (
               select distinct on (lower(p.name)) p.name
                 from (
                   select person_id from public.song_composers where song_id = p_song_id
                   union
                   select person_id from public.song_lyricists where song_id = p_song_id
                 ) credit
                 join public.people p on p.id = credit.person_id
                order by lower(p.name)
                limit 3
             ) w),
          (select t.name
             from public.song_tags st
             join public.tags t on t.id = st.tag_id
            where st.song_id = p_song_id and st.context = 'music' and t.type in ('culture', 'community')
            order by t.name
            limit 1)
        ), NFKD), '[̀-ͯ]', '', 'g'), '[-/‐-―]', ' ', 'g')),
        '[^a-z0-9[:space:]]', '', 'g'
      )),
      '\s+', '-', 'g'
    ),
    ''
  );
$$;

create or replace function public.song_tag_slug_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.context = 'music' then perform public.apply_song_slug(new.song_id); end if;
  if tg_op in ('DELETE', 'UPDATE') and old.context = 'music'
     and (tg_op = 'DELETE' or old.song_id <> new.song_id or new.context is distinct from 'music') then
    perform public.apply_song_slug(old.song_id);
  end if;
  return null;
end;
$$;

drop trigger if exists song_tags_slug_refresh on public.song_tags;
create constraint trigger song_tags_slug_refresh
  after insert or update or delete on public.song_tags
  deferrable initially deferred
  for each row execute function public.song_tag_slug_refresh();

-- 7. Reads ------------------------------------------------------------------------

create or replace function public.song_tag_names(p_song_id uuid, p_type text)
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(distinct t.name order by t.name), '{}')
  from public.song_tags st
  join public.tags t on t.id = st.tag_id
  where st.song_id = p_song_id and t.type = p_type;
$$;
grant execute on function public.song_tag_names(uuid, text) to anon, authenticated, service_role;

-- A tag and everything below it, through any number of parent links.
create or replace function public.tag_descendants(p_tag_ids uuid[])
returns table (tag_id uuid)
language sql
stable
set search_path = public
as $$
  with recursive d(id) as (
    select unnest(p_tag_ids)
    union
    select r.tag_id from public.tag_relations r join d on r.related_tag_id = d.id where r.kind = 'parent'
  )
  select id from d;
$$;
grant execute on function public.tag_descendants(uuid[]) to anon, authenticated, service_role;

drop function if exists public.song_filter_meta();
create function public.song_filter_meta()
returns table (
  song_id     uuid,
  genres      text[],
  languages   text[],
  themes      text[],
  cultures    text[],
  vibe        text,
  tonality    text,
  meter       text,
  year        int,
  forms       text[],
  occasions   text[],
  communities text[]
)
language sql
stable
set search_path = public
as $$
  select
    s.id as song_id,
    public.song_tag_names(s.id, 'genre'),
    public.song_tag_names(s.id, 'language'),
    public.song_tag_names(s.id, 'theme'),
    public.song_tag_names(s.id, 'culture'),
    s.vibe,
    s.tonality,
    s.meter,
    least(s.year_written, (select min(sra.year) from public.song_recording_artists sra where sra.song_id = s.id)) as year,
    public.song_tag_names(s.id, 'form'),
    public.song_tag_names(s.id, 'occasion'),
    public.song_tag_names(s.id, 'community')
  from public.songs s;
$$;
revoke execute on function public.song_filter_meta() from public;
grant execute on function public.song_filter_meta() to anon, authenticated, service_role;

drop function if exists public.genres_by_usage();
create function public.genres_by_usage()
returns table (name text)
language sql
stable
set search_path = public
as $$
  select t.name
  from public.tags t
  left join public.song_tags st on st.tag_id = t.id
  where t.type = 'genre'
  group by t.id, t.name
  order by count(st.song_id) desc, t.name
$$;
revoke execute on function public.genres_by_usage() from public, anon;
grant execute on function public.genres_by_usage() to authenticated, service_role;

drop function if exists public.my_repertoire();
create function public.my_repertoire()
returns table (
  song_id        uuid,
  confidence     text,
  key_note       text,
  updated_at     timestamptz,
  title          text,
  slug           text,
  display_artist text,
  first_line     text,
  hook           text,
  notes          text,
  vibe           text,
  tonality       text,
  meter          text,
  year           int,
  composers      text[],
  cultures       text[],
  productions    text[],
  genres         text[],
  languages      text[],
  themes         text[],
  popularity     bigint,
  chord_chart_url text,
  forms          text[],
  occasions      text[],
  communities    text[]
)
language sql
stable
security definer
set search_path = public
as $$
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
    public.song_tag_names(s.id, 'community') as communities
  from public.user_songs us
  join public.songs s on s.id = us.song_id
  where us.user_id = (select auth.uid())
  order by s.title asc, us.song_id asc;
$$;
revoke execute on function public.my_repertoire() from public, anon;
grant execute on function public.my_repertoire() to authenticated, service_role;

drop function if exists public.browse_songs(text[], text[], text[], text[], text, text, text, int, int, boolean, text, int, int);
create function public.browse_songs(
  p_genres       text[] default null,
  p_languages    text[] default null,
  p_themes       text[] default null,
  p_cultures     text[] default null,
  p_vibe         text default null,
  p_tonality     text default null,
  p_meter        text default null,
  p_year_min     int default null,
  p_year_max     int default null,
  p_exclude_mine boolean default false,
  p_sort         text default 'popularity',
  p_offset       int default 0,
  p_limit        int default 20,
  p_forms        text[] default null,
  p_occasions    text[] default null,
  p_communities  text[] default null
)
returns table (
  song_id          uuid,
  title            text,
  slug             text,
  display_artist   text,
  composers        text[],
  cultures         text[],
  productions      text[],
  genres           text[],
  languages        text[],
  themes           text[],
  vibe             text,
  tonality         text,
  meter            text,
  year             int,
  popularity       bigint,
  youtube_id       text,
  spotify_track_id text,
  recording_artists jsonb,
  production_credits jsonb,
  total_count      bigint,
  forms            text[],
  occasions        text[],
  communities      text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with meta as (
    select
      s.id,
      s.title,
      s.vibe,
      s.tonality,
      s.meter,
      public.song_tag_names(s.id, 'genre') as genres,
      public.song_tag_names(s.id, 'language') as languages,
      public.song_tag_names(s.id, 'theme') as themes,
      public.song_tag_names(s.id, 'culture') as cultures,
      public.song_tag_names(s.id, 'form') as forms,
      public.song_tag_names(s.id, 'occasion') as occasions,
      public.song_tag_names(s.id, 'community') as communities,
      least(s.year_written, (select min(sra.year) from public.song_recording_artists sra where sra.song_id = s.id)) as year,
      (select count(*) from public.user_songs us where us.song_id = s.id) as popularity
    from public.songs s
  ),
  filtered as (
    select m.*
    from meta m
    where (p_genres      is null or m.genres      && p_genres)
      and (p_languages   is null or m.languages   && p_languages)
      and (p_themes      is null or m.themes      && p_themes)
      and (p_cultures    is null or m.cultures    && p_cultures)
      and (p_forms       is null or m.forms       && p_forms)
      and (p_occasions   is null or m.occasions   && p_occasions)
      and (p_communities is null or m.communities && p_communities)
      and (p_vibe      is null or m.vibe  = p_vibe)
      and (p_meter     is null or m.meter = p_meter)
      and (p_tonality  is null or p_tonality = any(regexp_split_to_array(coalesce(m.tonality, ''), ',\s*')))
      and ((p_year_min is null and p_year_max is null)
        or (m.year is not null
            and (p_year_min is null or m.year >= p_year_min)
            and (p_year_max is null or m.year <= p_year_max)))
      and (not p_exclude_mine or not exists (
            select 1 from public.user_songs us
            where us.song_id = m.id and us.user_id = (select auth.uid())))
  ),
  page as (
    select f.*, count(*) over () as total_count
    from filtered f
    order by
      case when p_sort = 'title_asc'  then f.title end asc,
      case when p_sort = 'title_desc' then f.title end desc,
      case when p_sort not in ('title_asc', 'title_desc') then f.popularity end desc,
      f.title asc,
      f.id asc
    limit least(greatest(p_limit, 0), 200)
    offset greatest(p_offset, 0)
  )
  select
    s.id as song_id,
    s.title,
    s.slug,
    s.display_artist,
    coalesce((
      select array_agg(name order by name) from (
        select p.name from public.song_composers sc join public.people p on p.id = sc.person_id where sc.song_id = s.id
        union
        select p.name from public.song_lyricists sl join public.people p on p.id = sl.person_id where sl.song_id = s.id
      ) names
    ), '{}') as composers,
    pg.cultures,
    coalesce((select array_agg(pr.name) from public.song_productions sp join public.productions pr on pr.id = sp.production_id where sp.song_id = s.id), '{}') as productions,
    pg.genres,
    pg.languages,
    pg.themes,
    s.vibe,
    s.tonality,
    s.meter,
    pg.year,
    pg.popularity,
    coalesce(
      (select (regexp_match(sra.youtube_url, '(?:youtu\.be/|[?&]v=|/(?:embed|v|shorts)/)([a-zA-Z0-9_-]{11})'))[1]
       from public.song_recording_artists sra
       where sra.song_id = s.id and sra.youtube_url is not null
       order by sra.position nulls last limit 1),
      (regexp_match(s.youtube_url, '(?:youtu\.be/|[?&]v=|/(?:embed|v|shorts)/)([a-zA-Z0-9_-]{11})'))[1]
    ) as youtube_id,
    (select (regexp_match(sra.spotify_url, '/track/([a-zA-Z0-9]+)'))[1]
     from public.song_recording_artists sra
     where sra.song_id = s.id and sra.spotify_url is not null
     order by sra.position nulls last limit 1) as spotify_track_id,
    (select coalesce(jsonb_agg(jsonb_build_object('name', a.name, 'year', ra.year) order by ra.position nulls last, a.name), '[]'::jsonb)
     from public.song_recording_artists ra join public.artists a on a.id = ra.artist_id
     where ra.song_id = s.id) as recording_artists,
    (select coalesce(jsonb_agg(jsonb_build_object('name', pc.name, 'year', pc.year) order by pc.year nulls last, pc.name), '[]'::jsonb)
     from public.song_productions spc join public.productions pc on pc.id = spc.production_id
     where spc.song_id = s.id) as production_credits,
    pg.total_count,
    pg.forms,
    pg.occasions,
    pg.communities
  from page pg
  join public.songs s on s.id = pg.id
  order by
    case when p_sort = 'title_asc'  then pg.title end asc,
    case when p_sort = 'title_desc' then pg.title end desc,
    case when p_sort not in ('title_asc', 'title_desc') then pg.popularity end desc,
    pg.title asc,
    pg.id asc;
$$;
revoke execute on function public.browse_songs(text[], text[], text[], text[], text, text, text, int, int, boolean, text, int, int, text[], text[], text[]) from public;
grant execute on function public.browse_songs(text[], text[], text[], text[], text, text, text, int, int, boolean, text, int, int, text[], text[], text[]) to anon, authenticated, service_role;

drop function if exists public.search_songs(text, int);
create function public.search_songs(q text, limit_n int default 50)
returns table (
  song_id          uuid,
  title            text,
  display_artist   text,
  first_line       text,
  aka              text[],
  composers        text[],
  cultures         text[],
  productions      text[],
  genres           text[],
  languages        text[],
  themes           text[],
  vibe             text,
  tonality         text,
  meter            text,
  year             int,
  slug             text,
  score            float4,
  popularity       bigint,
  youtube_id       text,
  spotify_track_id text,
  recording_artists jsonb,
  production_credits jsonb,
  forms            text[],
  occasions        text[],
  communities      text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with normalized as (
    select regexp_replace(lower(q), '[^a-z0-9 ]', '', 'g') as nq
  ),
  matched as (
    select distinct s.id
    from public.songs s
    cross join normalized
    left join public.song_alternate_titles sat on sat.song_id = s.id
    left join public.song_composers sc on sc.song_id = s.id
    left join public.song_lyricists sl on sl.song_id = s.id
    left join public.people p on p.id = sc.person_id or p.id = sl.person_id
    left join public.song_productions sp on sp.song_id = s.id
    left join public.productions pr on pr.id = sp.production_id
    where
      s.title             ilike '%' || q || '%'
      or regexp_replace(lower(s.title), '[^a-z0-9 ]', '', 'g')                    ilike '%' || normalized.nq || '%'
      or s.first_line     ilike '%' || q || '%'
      or regexp_replace(lower(coalesce(s.first_line,'')), '[^a-z0-9 ]', '', 'g') ilike '%' || normalized.nq || '%'
      or s.hook           ilike '%' || q || '%'
      or regexp_replace(lower(coalesce(s.hook,'')), '[^a-z0-9 ]', '', 'g')       ilike '%' || normalized.nq || '%'
      or s.notes          ilike '%' || q || '%'
      or regexp_replace(lower(coalesce(s.notes,'')), '[^a-z0-9 ]', '', 'g')      ilike '%' || normalized.nq || '%'
      or s.display_artist ilike '%' || q || '%'
      or regexp_replace(lower(coalesce(s.display_artist,'')), '[^a-z0-9 ]', '', 'g') ilike '%' || normalized.nq || '%'
      or sat.title        ilike '%' || q || '%'
      or regexp_replace(lower(coalesce(sat.title,'')), '[^a-z0-9 ]', '', 'g')    ilike '%' || normalized.nq || '%'
      or p.name           ilike '%' || q || '%'
      or regexp_replace(lower(coalesce(p.name,'')), '[^a-z0-9 ]', '', 'g')       ilike '%' || normalized.nq || '%'
      or pr.name          ilike '%' || q || '%'
      or regexp_replace(lower(coalesce(pr.name,'')), '[^a-z0-9 ]', '', 'g')      ilike '%' || normalized.nq || '%'
      or to_tsvector('english',
           coalesce(s.title, '') || ' ' ||
           coalesce(s.first_line, '') || ' ' ||
           coalesce(s.display_artist, '') || ' ' ||
           coalesce(s.notes, '')
         ) @@ plainto_tsquery('english', q)
  ),
  media as (
    select distinct on (song_id)
      song_id,
      youtube_url,
      spotify_url
    from public.song_recording_artists
    order by song_id, position nulls last
  )
  select
    s.id             as song_id,
    s.title,
    s.display_artist,
    s.first_line,
    coalesce(array_agg(distinct sat.title) filter (where sat.title is not null), '{}'::text[]) as aka,
    coalesce(array_agg(distinct p.name) filter (where p.name is not null), '{}'::text[]) as composers,
    public.song_tag_names(s.id, 'culture') as cultures,
    coalesce(array_agg(distinct pr.name) filter (where pr.name is not null), '{}'::text[]) as productions,
    public.song_tag_names(s.id, 'genre') as genres,
    public.song_tag_names(s.id, 'language') as languages,
    public.song_tag_names(s.id, 'theme') as themes,
    s.vibe,
    s.tonality,
    s.meter,
    least(s.year_written, min(sra.year)) as year,
    s.slug,
    ts_rank(
      to_tsvector('english',
        coalesce(s.title, '') || ' ' ||
        coalesce(s.first_line, '') || ' ' ||
        coalesce(s.display_artist, '') || ' ' ||
        coalesce(s.notes, '') || ' ' ||
        coalesce(string_agg(distinct p.name, ' '), '') || ' ' ||
        coalesce(string_agg(distinct pr.name, ' '), '')
      ),
      plainto_tsquery('english', q)
    )                as score,
    (select count(*) from public.user_songs us where us.song_id = s.id) as popularity,
    (regexp_match(coalesce(med.youtube_url, s.youtube_url), '(?:youtu\.be/|[?&]v=|/(?:embed|v|shorts)/)([a-zA-Z0-9_-]{11})'))[1] as youtube_id,
    (regexp_match(med.spotify_url, '/track/([a-zA-Z0-9]+)'))[1] as spotify_track_id,
    (select coalesce(jsonb_agg(jsonb_build_object('name', a.name, 'year', ra.year) order by ra.position nulls last, a.name), '[]'::jsonb)
     from public.song_recording_artists ra join public.artists a on a.id = ra.artist_id
     where ra.song_id = s.id) as recording_artists,
    (select coalesce(jsonb_agg(jsonb_build_object('name', pc.name, 'year', pc.year) order by pc.year nulls last, pc.name), '[]'::jsonb)
     from public.song_productions spc join public.productions pc on pc.id = spc.production_id
     where spc.song_id = s.id) as production_credits,
    public.song_tag_names(s.id, 'form') as forms,
    public.song_tag_names(s.id, 'occasion') as occasions,
    public.song_tag_names(s.id, 'community') as communities
  from matched m
  join public.songs s on s.id = m.id
  left join public.song_alternate_titles sat on sat.song_id = s.id
  left join public.song_composers sc on sc.song_id = s.id
  left join public.song_lyricists sl on sl.song_id = s.id
  left join public.people p on p.id = sc.person_id or p.id = sl.person_id
  left join public.song_recording_artists sra on sra.song_id = s.id
  left join public.song_productions sp on sp.song_id = s.id
  left join public.productions pr on pr.id = sp.production_id
  left join media med on med.song_id = s.id
  group by s.id, med.youtube_url, med.spotify_url
  order by score desc, s.title
  limit least(greatest(limit_n, 0), 100);
$$;
revoke execute on function public.search_songs(text, int) from public;
grant execute on function public.search_songs(text, int) to anon, authenticated, service_role;

drop function if exists public.suggest_songs_for_user(uuid, int, int);
create function public.suggest_songs_for_user(
  p_user_id uuid,
  p_limit   int default 20,
  p_offset  int default 0
)
returns table (
  song_id          uuid,
  title            text,
  display_artist   text,
  first_line       text,
  slug             text,
  composers        text[],
  cultures         text[],
  productions      text[],
  genres           text[],
  languages        text[],
  year             int,
  popularity       bigint,
  youtube_id       text,
  spotify_track_id text,
  recording_artists jsonb,
  production_credits jsonb,
  communities      text[]
)
language sql
security definer
set search_path = public
as $$
  with user_tags as (
    select distinct st.tag_id
    from public.user_songs us
    join public.song_tags st on st.song_id = us.song_id
    join public.tags t on t.id = st.tag_id
    where us.user_id = p_user_id and t.type in ('genre', 'culture', 'community')
  ),
  popularity as (
    select song_id, count(*) as user_count
    from public.user_songs
    group by song_id
  ),
  affinity as (
    select s.id as song_id, count(distinct ut.tag_id) as score
    from public.songs s
    left join public.song_tags st on st.song_id = s.id
    left join user_tags ut on ut.tag_id = st.tag_id
    where s.id not in (select song_id from public.user_songs where user_id = p_user_id)
    group by s.id
  ),
  scored as (
    select a.song_id, coalesce(p.user_count, 0) as pop, a.score * 3 + coalesce(p.user_count, 0) as total
    from affinity a
    left join popularity p on p.song_id = a.song_id
    where coalesce(p.user_count, 0) > 0
  ),
  media as (
    select distinct on (song_id) song_id, youtube_url, spotify_url
    from public.song_recording_artists
    order by song_id, position nulls last
  )
  select
    s.id,
    s.title,
    s.display_artist,
    s.first_line,
    s.slug,
    coalesce(array_agg(distinct pe.name) filter (where pe.name is not null), '{}'::text[]) as composers,
    public.song_tag_names(s.id, 'culture') as cultures,
    coalesce(array_agg(distinct pr.name) filter (where pr.name is not null), '{}'::text[]) as productions,
    public.song_tag_names(s.id, 'genre') as genres,
    public.song_tag_names(s.id, 'language') as languages,
    least(s.year_written, min(sra.year)) as year,
    scr.pop as popularity,
    (regexp_match(coalesce(med.youtube_url, s.youtube_url), '(?:youtu\.be/|[?&]v=|/(?:embed|v|shorts)/)([a-zA-Z0-9_-]{11})'))[1] as youtube_id,
    (regexp_match(med.spotify_url, '/track/([a-zA-Z0-9]+)'))[1] as spotify_track_id,
    (select coalesce(jsonb_agg(jsonb_build_object('name', a.name, 'year', ra.year) order by ra.position nulls last, a.name), '[]'::jsonb)
     from public.song_recording_artists ra join public.artists a on a.id = ra.artist_id
     where ra.song_id = s.id) as recording_artists,
    (select coalesce(jsonb_agg(jsonb_build_object('name', pc.name, 'year', pc.year) order by pc.year nulls last, pc.name), '[]'::jsonb)
     from public.song_productions spc join public.productions pc on pc.id = spc.production_id
     where spc.song_id = s.id) as production_credits,
    public.song_tag_names(s.id, 'community') as communities
  from scored scr
  join public.songs s on s.id = scr.song_id
  left join public.song_composers scomp on scomp.song_id = s.id
  left join public.song_lyricists slyrc on slyrc.song_id = s.id
  left join public.people pe on pe.id = scomp.person_id or pe.id = slyrc.person_id
  left join public.song_productions sp on sp.song_id = s.id
  left join public.productions pr on pr.id = sp.production_id
  left join public.song_recording_artists sra on sra.song_id = s.id
  left join media med on med.song_id = s.id
  group by s.id, scr.pop, scr.total, med.youtube_url, med.spotify_url
  order by scr.total desc, s.title
  limit p_limit
  offset p_offset;
$$;
grant execute on function public.suggest_songs_for_user(uuid, int, int) to authenticated;

-- 8. Writes -------------------------------------------------------------------

-- A tag of this type by name or alias; creates it when the caller may (admins,
-- or song editors for languages) and fails with a clear message otherwise.
create or replace function public.lookup_or_create_tag(p_type text, p_name text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  found_id uuid;
  clean text := trim(p_name);
begin
  if clean is null or clean = '' then return null; end if;
  select id into found_id from public.tags where type = p_type and lower(name) = lower(clean) limit 1;
  if found_id is null then
    select id into found_id from public.tags
    where type = p_type and exists (select 1 from unnest(aliases) a where lower(a) = lower(clean))
    order by name limit 1;
  end if;
  if found_id is not null then return found_id; end if;
  begin
    insert into public.tags (type, name, slug) values (p_type, clean, public.tag_slug(clean)) returning id into found_id;
  exception when insufficient_privilege then
    raise exception 'Only admins can add a new % (%).', p_type, clean using errcode = '42501';
  end;
  return found_id;
end;
$$;
revoke execute on function public.lookup_or_create_tag(text, text) from public, anon;
grant execute on function public.lookup_or_create_tag(text, text) to authenticated, service_role;

-- An old-style name (from app code that predates this migration) to the tag
-- it now is: through the old row when there is one, else by name or alias.
create or replace function public.legacy_tag_for(p_table text, p_name text)
returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
declare found_id uuid;
begin
  execute format('select m.tag_id from public.%I x join public.tag_legacy_map m on m.legacy_table = %L and m.legacy_id = x.id
                  where lower(x.name) = lower(trim($1)) limit 1', p_table, p_table)
    into found_id using p_name;
  if found_id is null then
    found_id := public.lookup_or_create_tag(case p_table when 'genres' then 'genre' when 'themes' then 'theme'
                                                         when 'languages' then 'language' else 'culture' end, p_name);
  end if;
  return found_id;
end;
$$;
revoke execute on function public.legacy_tag_for(text, text) from public, anon;
grant execute on function public.legacy_tag_for(text, text) to authenticated, service_role;

-- p (new shape):
--   tags          { genre: [names], theme: [...], language: [...], culture: [...],
--                   form: [...], occasion: [...], community: [...] }
--                 each type present is replaced in full; absent types are left alone
--   music_tag, lyric_tag   { type, name } or null: where the melody / words come from
-- p (old shape, from app code before 202): genres, themes, languages, cultures
--   (names), music_culture, lyric_culture. Kept until the old tables are dropped.
-- Everything else is as in migration 200.
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
