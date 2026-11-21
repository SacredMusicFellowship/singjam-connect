-- Migration 180: count joining an event's set list through the open link
--
-- People who pay at the door have no ticket to check in. Many of them do join
-- the event's set list by scanning its QR code, which is only open during the
-- event. That join is the only trace they leave, so it counts as attending.
--
-- Only self-joins count: a row the person created themselves (invited_by =
-- user_id, from the open-link auto-join on /set/[id]). Buying a ticket,
-- RSVPing, or linking a set to the event also add people to the set — as
-- editors invited by the owner, before the event — and prove nothing about
-- showing up. The join must also fall within two hours of the event, in case a
-- set's link is left open afterwards.

alter table public.event_attendance drop constraint if exists event_attendance_source_check;
alter table public.event_attendance
  add constraint event_attendance_source_check
  check (source in ('checkin', 'ac_import', 'set_join'));

create or replace function public.record_event_attendance()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  from_checkins integer;
  from_set_joins integer;
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
  get diagnostics from_checkins = row_count;

  -- Runs second, so someone who was checked in AND joined keeps 'checkin'.
  insert into public.event_attendance (jam_id, email, user_id, name, source)
  select
    j.id,
    lower(u.email),
    c.user_id,
    nullif(btrim(concat_ws(' ', p.display_name, p.last_name)), ''),
    'set_join'
  from public.set_collaborators c
  join public.sets s on s.id = c.set_id
  join public.jams j on j.id = s.jam_id
  join auth.users u on u.id = c.user_id
  left join public.profiles p on p.id = c.user_id
  where j.visibility = 'official'
    and coalesce(j.ends_at, j.starts_at + interval '4 hours') < now()
    and c.status = 'accepted'
    and c.invited_by = c.user_id
    and c.created_at between j.starts_at - interval '2 hours'
                         and coalesce(j.ends_at, j.starts_at + interval '4 hours') + interval '2 hours'
    and u.email is not null
  on conflict (jam_id, email) do nothing;
  get diagnostics from_set_joins = row_count;

  return from_checkins + from_set_joins;
end;
$$;

-- Set joiners always have an account, so they are eligible for the tag like
-- any member. Imported AC rows still never are.
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
  where a.source in ('checkin', 'set_join')
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
