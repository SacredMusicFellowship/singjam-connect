-- Migration 176: who attended which official SingJam event
--
-- One row per person per official event. A person is their lowercased email,
-- because guests have no profile and a guest who later signs up should still
-- count as the same attendee. "Attended" means checked in at the door, not
-- merely holding a ticket.
--
-- Rows come from two places:
--   checkin   — recorded by record_event_attendance() once an event has ended
--   ac_import — events from before in-app ticketing, which were recorded as
--               per-event ActiveCampaign tags. Imported by the nightly sweep
--               (emails come from AC at run time, so none live in this repo).
--
-- first_timer_tagged_at marks the row whose event was the person's first and
-- for which the "SingJam First-Time Attendee" AC tag has been applied.

create table if not exists public.event_attendance (
  id uuid primary key default gen_random_uuid(),
  jam_id uuid not null references public.jams(id) on delete cascade,
  email text not null check (email = lower(email)),
  user_id uuid references public.profiles(id) on delete set null,
  name text,
  -- Guests only reach ActiveCampaign if they ticked the mailing-list box.
  marketing_opt_in boolean not null default false,
  source text not null check (source in ('checkin', 'ac_import')),
  first_timer_tagged_at timestamptz,
  created_at timestamptz not null default now(),
  unique (jam_id, email)
);

create index if not exists event_attendance_email_idx on public.event_attendance (email);

-- Admin-only: names and emails of guests. No client policies, and no
-- anon/authenticated grants — the admin page and the sweep use the service role.
alter table public.event_attendance enable row level security;
grant select, insert, update, delete on public.event_attendance to service_role;

-- Copies door check-ins for official events that have ended into
-- event_attendance. Idempotent; returns how many rows it added. Waits for the
-- end so a check-in undone at the door never counts. Events without an end
-- time are treated as over four hours after they start.
create or replace function public.record_event_attendance()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  added integer;
begin
  insert into public.event_attendance (jam_id, email, user_id, name, marketing_opt_in, source)
  select distinct on (t.jam_id, lower(coalesce(u.email, t.holder_email)))
    t.jam_id,
    lower(coalesce(u.email, t.holder_email)),
    t.holder_user_id,
    coalesce(nullif(btrim(concat_ws(' ', p.display_name, p.last_name)), ''), t.holder_name),
    o.marketing_opt_in,
    'checkin'
  from public.tickets t
  join public.ticket_orders o on o.id = t.order_id
  join public.jams j on j.id = t.jam_id
  left join auth.users u on u.id = t.holder_user_id
  left join public.profiles p on p.id = t.holder_user_id
  where j.visibility = 'official'
    and coalesce(j.ends_at, j.starts_at + interval '4 hours') < now()
    and o.status = 'paid'
    and t.checked_in_at is not null
    and coalesce(u.email, t.holder_email) is not null
  -- Prefer a member's ticket when one person holds several on an order.
  order by t.jam_id, lower(coalesce(u.email, t.holder_email)), t.holder_user_id nulls last, t.id
  on conflict (jam_id, email) do nothing;

  get diagnostics added = row_count;
  return added;
end;
$$;

-- Check-in rows that are the person's earliest recorded event and still need
-- the first-timer tag. Only members and opted-in guests are eligible. A
-- person with any earlier row — an imported spring event, or an earlier visit
-- as a guest who didn't opt in — is not a first-timer.
create or replace function public.event_first_timers_to_tag()
returns table (id uuid, email text)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.email
  from public.event_attendance a
  join public.jams j on j.id = a.jam_id
  where a.source = 'checkin'
    and a.first_timer_tagged_at is null
    and (a.user_id is not null or a.marketing_opt_in)
    and not exists (
      select 1
      from public.event_attendance b
      join public.jams jb on jb.id = b.jam_id
      where b.email = a.email
        and b.id <> a.id
        and jb.starts_at < j.starts_at
    )
  order by j.starts_at, a.id;
$$;

revoke all on function public.record_event_attendance() from public, anon, authenticated;
grant execute on function public.record_event_attendance() to service_role;
revoke all on function public.event_first_timers_to_tag() from public, anon, authenticated;
grant execute on function public.event_first_timers_to_tag() to service_role;
