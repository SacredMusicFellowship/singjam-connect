-- SingJam Connect: initial schema
-- Run in Supabase SQL editor

create extension if not exists pgcrypto;

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  neighborhood text,
  instruments text[] default '{}'::text[],
  roles text[] default '{}'::text[],
  vibes text[] default '{}'::text[],
  comfort_level text check (comfort_level in ('Beginner','Comfortable','Strong','Leader')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Songs
create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,
  tags text[] default '{}'::text[],
  created_at timestamptz default now()
);

-- User-song connections
create table if not exists public.user_songs (
  user_id uuid references public.profiles(id) on delete cascade,
  song_id uuid references public.songs(id) on delete cascade,
  confidence text not null check (confidence in ('lead','support','follow','learn')),
  updated_at timestamptz default now(),
  primary key (user_id, song_id)
);

-- Song packs
create table if not exists public.song_packs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sort_order int default 100,
  created_at timestamptz default now()
);

create table if not exists public.song_pack_songs (
  pack_id uuid references public.song_packs(id) on delete cascade,
  song_id uuid references public.songs(id) on delete cascade,
  primary key (pack_id, song_id)
);

-- Jams
create table if not exists public.jams (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid references public.profiles(id) on delete cascade,
  jam_type text not null,
  starts_at timestamptz,
  neighborhood text,
  notes text,
  visibility text not null default 'radius' check (visibility in ('private','radius')),
  created_at timestamptz default now()
);

-- Jam invitations / RSVPs (simple)
create table if not exists public.jam_invites (
  jam_id uuid references public.jams(id) on delete cascade,
  invited_user_id uuid references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz default now(),
  primary key (jam_id, invited_user_id)
);

-- Matching RPC: find users with shared songs
create or replace function public.match_jammers(for_user_id uuid, limit_n int default 30)
returns table (
  user_id uuid,
  display_name text,
  neighborhood text,
  shared_count int,
  top_shared text[]
)
language sql
security definer
as $$
  with my as (
    select song_id, confidence
    from public.user_songs
    where user_id = for_user_id
      and confidence in ('lead','support','follow')
  ),
  others as (
    select us.user_id, us.song_id
    from public.user_songs us
    where us.user_id <> for_user_id
      and us.confidence in ('lead','support','follow')
  ),
  song_overlaps as (
    select o.user_id, count(*)::int as shared_count
    from others o
    join my on my.song_id = o.song_id
    group by o.user_id
  ),
  top5 as (
    select o.user_id,
           array_agg(s.title order by s.title) filter (where s.title is not null) as titles
    from others o
    join my on my.song_id = o.song_id
    join public.songs s on s.id = o.song_id
    group by o.user_id
  )
  select p.id as user_id,
         p.display_name,
         p.neighborhood,
         ov.shared_count,
         coalesce(top5.titles[1:10], '{}'::text[]) as top_shared
  from song_overlaps ov
  join public.profiles p on p.id = ov.user_id
  left join top5 on top5.user_id = ov.user_id
  where ov.shared_count > 0
  order by ov.shared_count desc
  limit limit_n;
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.songs enable row level security;
alter table public.user_songs enable row level security;
alter table public.song_packs enable row level security;
alter table public.song_pack_songs enable row level security;
alter table public.jams enable row level security;
alter table public.jam_invites enable row level security;

-- Policies (MVP: open read for songs/packs; users manage their own profile & user_songs; jams readable in radius later)
create policy "read songs" on public.songs for select using (true);
create policy "read packs" on public.song_packs for select using (true);
create policy "read pack songs" on public.song_pack_songs for select using (true);

create policy "read profiles" on public.profiles for select using (true);

create policy "upsert own profile" on public.profiles
for insert with check (auth.uid() = id);
create policy "update own profile" on public.profiles
for update using (auth.uid() = id);

create policy "read own user_songs" on public.user_songs
for select using (auth.uid() = user_id);
create policy "upsert own user_songs" on public.user_songs
for insert with check (auth.uid() = user_id);
create policy "update own user_songs" on public.user_songs
for update using (auth.uid() = user_id);

create policy "insert own jam" on public.jams
for insert with check (auth.uid() = host_user_id);
create policy "read jams" on public.jams
for select using (true);

create policy "invite rsvp read" on public.jam_invites
for select using (auth.uid() = invited_user_id or auth.uid() = (select host_user_id from public.jams where id = jam_id));
create policy "invite rsvp insert host" on public.jam_invites
for insert with check (auth.uid() = (select host_user_id from public.jams where id = jam_id));
create policy "invite rsvp update invited" on public.jam_invites
for update using (auth.uid() = invited_user_id);
