-- Migration 205: browse pages for people, artists, shows and tags.
--
-- * people, artists and productions get a slug (their address: /people/john-newton),
--   kept by the database like tags.slug (202): set from the name on insert and
--   rename, -2/-3… on a clash; a show's year is added when two shows share a name.
-- * productions.medium: stage, film, animated, tv or game, so shows can be
--   browsed by medium (Ben's round-2 review, 2026-11-07).
-- * browse_songs takes p_song_ids, so a browse page lists exactly its songs
--   with the same song cards and sorting as the Song Library.
-- * members_knowing(song ids): how many people on SingJam know at least one of
--   them, for the "N members know songs by …" line. A count only, no names.

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
  if p_table not in ('people', 'artists', 'productions') then raise exception 'next_free_slug: unsupported table %', p_table; end if;
  loop
    execute format('select exists (select 1 from public.%I where slug = $1 and id <> $2)', p_table) into taken using candidate, p_id;
    exit when not taken;
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end;
$$;

alter table public.people add column if not exists slug text;
alter table public.artists add column if not exists slug text;
alter table public.productions add column if not exists slug text;
alter table public.productions add column if not exists medium text check (medium in ('stage', 'film', 'animated', 'tv', 'game'));

create or replace function public.named_row_slug()
returns trigger
language plpgsql
set search_path = public
as $$
declare base text;
begin
  if tg_op = 'UPDATE' and new.name is not distinct from old.name and new.slug is not null
     and (to_jsonb(new)->>'year') is not distinct from (to_jsonb(old)->>'year') then
    return new;
  end if;
  base := public.tag_slug(new.name);
  if tg_table_name = 'productions' and (to_jsonb(new)->>'year') is not null
     and exists (select 1 from public.productions p where p.id <> new.id and lower(p.name) = lower(new.name)) then
    base := base || '-' || (to_jsonb(new)->>'year');
  end if;
  new.slug := public.next_free_slug(tg_table_name, base, new.id);
  return new;
end;
$$;

do $$
declare tbl text;
begin
  foreach tbl in array array['people', 'artists', 'productions'] loop
    execute format('drop trigger if exists %I on public.%I', tbl || '_slug', tbl);
    execute format('create trigger %I before insert or update of name%s on public.%I for each row execute function public.named_row_slug()',
                   tbl || '_slug', case when tbl = 'productions' then ', year' else '' end, tbl);
  end loop;
end $$;

-- Fill the slugs: touching the name runs the trigger. Oldest first, so the
-- original keeps the plain slug when two names collide.
update public.people set name = name where slug is null and id in (select id from public.people order by created_at, id);
update public.artists set name = name where slug is null and id in (select id from public.artists order by created_at, id);
update public.productions set name = name where slug is null;

create unique index if not exists people_slug_key on public.people (slug);
create unique index if not exists artists_slug_key on public.artists (slug);
create unique index if not exists productions_slug_key on public.productions (slug);
alter table public.people alter column slug set not null;
alter table public.artists alter column slug set not null;
alter table public.productions alter column slug set not null;

update public.productions p set medium = v.medium
from (values
  ('Aladdin', 1992, 'animated'), ('Annie', 1977, 'stage'), ('Beauty and the Beast', 1991, 'animated'),
  ('Cinderella', 1950, 'animated'), ('Cinderella', 1957, 'tv'), ('Dear Evan Hansen', 2015, 'stage'),
  ('Fiddler on the Roof', 1964, 'stage'), ('Grease', 1971, 'stage'), ('Guardians of the Galaxy', 2014, 'film'),
  ('Hamilton', 2015, 'stage'), ('Harold and Maude', 1971, 'film'), ('Les Misérables', 1980, 'stage'),
  ('Moana', 2016, 'animated'), ('Mulan', 1998, 'animated'), ('Oklahoma!', 1943, 'stage'), ('Peter Pan', 1954, 'stage'),
  ('Pitch Perfect', 2012, 'film'), ('Pocahontas', 1995, 'animated'), ('Rent', 1996, 'stage'), ('Sesame Street', 1969, 'tv'),
  ('Shrek', 2001, 'animated'), ('The Bodyguard', 1992, 'film'), ('The Breakfast Club', 1985, 'film'),
  ('The Lion King', 1994, 'animated'), ('The Little Mermaid', 1989, 'animated'), ('The Muppet Movie', 1979, 'film'),
  ('The Prince of Egypt', 1998, 'animated'), ('The Roar of the Greasepaint – The Smell of the Crowd', 1964, 'stage'),
  ('The Sound of Music', 1959, 'stage'), ('The Twilight Saga: Breaking Dawn – Part 1', 2011, 'film'),
  ('The Wizard of Oz', 1939, 'film'), ('Undertale', 2015, 'game')
) as v(name, year, medium)
where p.name = v.name and p.year = v.year and p.medium is null;

-- people/artists/productions keep their existing table grants; the new columns
-- are readable like the rest of each row.

create or replace function public.members_knowing(p_song_ids uuid[])
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct user_id)::int from public.user_songs where song_id = any(p_song_ids);
$$;
revoke execute on function public.members_knowing(uuid[]) from public;
grant execute on function public.members_knowing(uuid[]) to anon, authenticated, service_role;

drop function if exists public.browse_songs(text[], text[], text[], text[], text, text, text, int, int, boolean, text, int, int, text[], text[], text[]);
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
  p_communities  text[] default null,
  p_song_ids     uuid[] default null
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
  communities      text[],
  byline           text
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
    where p_song_ids is null or s.id = any(p_song_ids)
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
      and (p_song_ids is null or m.id = any(p_song_ids))
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
    pg.communities,
    public.byline(s) as byline
  from page pg
  join public.songs s on s.id = pg.id
  order by
    case when p_sort = 'title_asc'  then pg.title end asc,
    case when p_sort = 'title_desc' then pg.title end desc,
    case when p_sort not in ('title_asc', 'title_desc') then pg.popularity end desc,
    pg.title asc,
    pg.id asc;
$$;
revoke execute on function public.browse_songs(text[], text[], text[], text[], text, text, text, int, int, boolean, text, int, int, text[], text[], text[], uuid[]) from public;
grant execute on function public.browse_songs(text[], text[], text[], text[], text, text, text, int, int, boolean, text, int, int, text[], text[], text[], uuid[]) to anon, authenticated, service_role;

