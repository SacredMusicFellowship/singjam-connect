-- Migration 193: chord charts anyone can add and others review; enrichment
-- progress on songs; the old review queue retired.

-- 1. The review queue is gone (songs fill themselves in now). Clear the flags
--    left on songs added before the change.
update public.songs set needs_review = false where needs_review;

-- 2. When automatic enrichment is running, so the song page can say so and
--    fill fields in as they land.
alter table public.songs
  add column if not exists enrichment_started_at timestamptz,
  add column if not exists enrichment_finished_at timestamptz;

-- 3. Chord chart submissions. songs.chord_chart_url stays the live chart every
--    reader already uses; chord_chart_pending marks a live chart nobody else
--    has reviewed yet (shown with an "unreviewed" label).
alter table public.songs add column if not exists chord_chart_pending boolean not null default false;

create table if not exists public.chord_chart_submissions (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  url text not null,
  submitted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  note text
);

create index if not exists chord_chart_submissions_song_idx on public.chord_chart_submissions (song_id, created_at desc);
create index if not exists chord_chart_submissions_pending_idx on public.chord_chart_submissions (created_at desc) where status = 'pending';

alter table public.chord_chart_submissions enable row level security;

-- Readable by anyone (the charts themselves are public on every song page).
-- Every write goes through the API routes, which enforce who may submit,
-- review and report, using the service role.
drop policy if exists "read chord chart submissions" on public.chord_chart_submissions;
create policy "read chord chart submissions" on public.chord_chart_submissions
  for select using (true);

grant select on public.chord_chart_submissions to anon;
grant select, insert, update, delete on public.chord_chart_submissions to authenticated;
grant select, insert, update, delete on public.chord_chart_submissions to service_role;

-- 4. Existing charts count as approved (who added them wasn't recorded). A
--    "chart" that isn't an Ultimate Guitar tab — one is an image thumbnail — is
--    rejected and taken down.
insert into public.chord_chart_submissions (song_id, url, status, reviewed_at, note)
select id, chord_chart_url,
  case when chord_chart_url ~* '^https?://([a-z0-9-]+\.)?ultimate-guitar\.com/' then 'approved' else 'rejected' end,
  now(),
  case when chord_chart_url ~* '^https?://([a-z0-9-]+\.)?ultimate-guitar\.com/' then 'Existing chart, before reviews' else 'Not an Ultimate Guitar tab' end
from public.songs
where chord_chart_url is not null
  and not exists (select 1 from public.chord_chart_submissions c where c.song_id = songs.id);

update public.songs set chord_chart_url = null
where chord_chart_url is not null and chord_chart_url !~* '^https?://([a-z0-9-]+\.)?ultimate-guitar\.com/';
