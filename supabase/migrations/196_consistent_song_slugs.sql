-- Migration 196: every song slug follows one formula, kept by the database.
--
-- Formula: title + the first three writers (composers and lyricists, A–Z,
-- each name once) + the music culture, accents converted (é → e), hyphens and
-- slashes treated as spaces, lowercased, anything but letters, digits and
-- spaces dropped, spaces → hyphens. A clash
-- gets -2, -3, …
--
-- The database sets the slug on insert and recomputes it whenever the title,
-- writers, a writer's name or the music culture change, so no app code path
-- can drift from it; a client trying to set slug directly is ignored. Every
-- replaced slug goes into song_slug_history so old links keep resolving
-- (resolve_song_slug). songs.former_slug is no longer written; it stays for
-- older app builds that still read it.

-- 1. Old slugs ---------------------------------------------------------------
create table if not exists public.song_slug_history (
  slug        text primary key,
  song_id     uuid not null references public.songs(id) on delete cascade,
  replaced_at timestamptz not null default now()
);
create index if not exists song_slug_history_song_id_idx on public.song_slug_history (song_id);

alter table public.song_slug_history enable row level security;
drop policy if exists "song slug history is public" on public.song_slug_history;
create policy "song slug history is public" on public.song_slug_history for select using (true);

grant select on public.song_slug_history to anon;
grant select, insert, update, delete on public.song_slug_history to authenticated;
grant select, insert, update, delete on public.song_slug_history to service_role;

-- 2. The formula -------------------------------------------------------------
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
          (select c.name
             from public.song_cultures sc
             join public.cultures c on c.id = sc.culture_id
            where sc.song_id = p_song_id and sc.context = 'music'
            order by c.name
            limit 1)
        ), NFKD), '[\u0300-\u036f]', '', 'g'), '[-/\u2010-\u2015]', ' ', 'g')),
        '[^a-z0-9[:space:]]', '', 'g'
      )),
      '\s+', '-', 'g'
    ),
    ''
  );
$$;

-- A free slug for this song: not another song's current slug or old slug.
create or replace function public.unique_song_slug(p_base text, p_song_id uuid)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  candidate text := p_base;
  n int := 2;
begin
  while exists (select 1 from public.songs where slug = candidate and id <> p_song_id)
     or exists (select 1 from public.song_slug_history where slug = candidate and song_id <> p_song_id) loop
    candidate := p_base || '-' || n;
    n := n + 1;
  end loop;
  return candidate;
end;
$$;

-- Recompute one song's slug, keeping the old one in the history.
create or replace function public.apply_song_slug(p_song_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_slug text;
  song_title text;
  target text;
begin
  select slug, title into current_slug, song_title from public.songs where id = p_song_id;
  if not found then return; end if;
  target := public.unique_song_slug(coalesce(public.song_slug_base(p_song_id, song_title), p_song_id::text), p_song_id);
  if target is not distinct from current_slug then return; end if;
  if current_slug is not null then
    insert into public.song_slug_history (slug, song_id) values (current_slug, p_song_id) on conflict (slug) do nothing;
  end if;
  delete from public.song_slug_history where slug = target and song_id = p_song_id;
  perform set_config('singjam.slug_write', 'on', true);
  update public.songs set slug = target where id = p_song_id;
  perform set_config('singjam.slug_write', 'off', true);
end;
$$;

revoke execute on function public.apply_song_slug(uuid) from public, anon, authenticated;

-- 3. Keeping it -------------------------------------------------------------
create or replace function public.songs_slug_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.slug := public.unique_song_slug(coalesce(public.song_slug_base(new.id, new.title), new.id::text), new.id);
  elsif new.title is distinct from old.title then
    new.slug := public.unique_song_slug(coalesce(public.song_slug_base(new.id, new.title), new.id::text), new.id);
    if new.slug is distinct from old.slug and old.slug is not null then
      insert into public.song_slug_history (slug, song_id) values (old.slug, new.id) on conflict (slug) do nothing;
      delete from public.song_slug_history where slug = new.slug and song_id = new.id;
    end if;
  elsif new.slug is distinct from old.slug and coalesce(current_setting('singjam.slug_write', true), 'off') <> 'on' then
    new.slug := old.slug;
  end if;
  return new;
end;
$$;

drop trigger if exists songs_slug_guard on public.songs;
create trigger songs_slug_guard
  before insert or update on public.songs
  for each row execute function public.songs_slug_guard();

create or replace function public.song_credit_slug_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then perform public.apply_song_slug(new.song_id); end if;
  if tg_op in ('DELETE', 'UPDATE') and (tg_op = 'DELETE' or old.song_id <> new.song_id) then
    perform public.apply_song_slug(old.song_id);
  end if;
  return null;
end;
$$;

drop trigger if exists song_composers_slug_refresh on public.song_composers;
create trigger song_composers_slug_refresh
  after insert or update or delete on public.song_composers
  for each row execute function public.song_credit_slug_refresh();

drop trigger if exists song_lyricists_slug_refresh on public.song_lyricists;
create trigger song_lyricists_slug_refresh
  after insert or update or delete on public.song_lyricists
  for each row execute function public.song_credit_slug_refresh();

-- Only the music culture is in the slug. A separate function because the
-- composer and lyricist tables have no context column to test.
create or replace function public.song_culture_slug_refresh()
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

drop trigger if exists song_cultures_slug_refresh on public.song_cultures;
create trigger song_cultures_slug_refresh
  after insert or update or delete on public.song_cultures
  for each row execute function public.song_culture_slug_refresh();

create or replace function public.people_name_slug_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s uuid;
begin
  for s in
    select song_id from public.song_composers where person_id = new.id
    union
    select song_id from public.song_lyricists where person_id = new.id
  loop
    perform public.apply_song_slug(s);
  end loop;
  return null;
end;
$$;

drop trigger if exists people_name_slug_refresh on public.people;
create trigger people_name_slug_refresh
  after update of name on public.people
  for each row when (new.name is distinct from old.name)
  execute function public.people_name_slug_refresh();

-- 4. Finding a song by any slug it has had ----------------------------------
create or replace function public.resolve_song_slug(p_slug text)
returns uuid
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select id from public.songs where slug = p_slug),
    (select song_id from public.song_slug_history where slug = p_slug)
  );
$$;

grant execute on function public.resolve_song_slug(text) to anon, authenticated, service_role;

-- 5. Bring existing songs into line ----------------------------------------
insert into public.song_slug_history (slug, song_id)
select s.former_slug, s.id
  from public.songs s
 where s.former_slug is not null
   and s.former_slug <> s.slug
   and not exists (select 1 from public.songs o where o.slug = s.former_slug)
on conflict (slug) do nothing;

do $$
declare
  s record;
begin
  for s in select id from public.songs order by created_at, id loop
    perform public.apply_song_slug(s.id);
  end loop;
end;
$$;
