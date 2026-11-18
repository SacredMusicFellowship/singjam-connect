-- Migration 237: a comment thread on chord charts for the people who review them.
-- Reviewers can discuss a chart, give a reason when they reject or replace one,
-- and reports land here instead of overwriting chord_chart_submissions.note
-- (which anyone could read). Only admins and song editors can read comments;
-- every write goes through the API with the service role.

create table if not exists public.chord_chart_comments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.chord_chart_submissions(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  kind text not null default 'comment' check (kind in ('comment', 'report', 'approve', 'reject', 'replace')),
  body text not null check (length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists chord_chart_comments_submission_idx
  on public.chord_chart_comments (submission_id, created_at);

alter table public.chord_chart_comments enable row level security;

drop policy if exists "reviewers read chord chart comments" on public.chord_chart_comments;
create policy "reviewers read chord chart comments" on public.chord_chart_comments
  for select using (
    exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('admin', 'song_editor'))
  );

grant select on public.chord_chart_comments to anon;
grant select, insert, update, delete on public.chord_chart_comments to authenticated;
grant select, insert, update, delete on public.chord_chart_comments to service_role;

-- Existing notes: reports and the one rejection reason become comments. The rest
-- are labels left by migrations 193 and 236 ("Existing chart, before reviews",
-- "Set in the song editor") that the record itself already says. Then the
-- publicly readable note column is emptied.
insert into public.chord_chart_comments (submission_id, kind, body, created_at)
select c.id,
  case when c.note like 'Reported:%' then 'report' else 'reject' end,
  case when c.note like 'Reported:%' then coalesce(nullif(trim(substr(c.note, 10)), ''), 'Something''s wrong with this chart') else c.note end,
  coalesce(c.reviewed_at, c.created_at)
from public.chord_chart_submissions c
where c.note like 'Reported:%'
   or (c.status = 'rejected' and c.note = 'Not an Ultimate Guitar tab');

update public.chord_chart_submissions set note = null where note is not null;
