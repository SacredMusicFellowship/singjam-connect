-- Migration 181: tag each person as a first-timer at most once
--
-- A first-timer is someone whose earliest recorded event this is. But an
-- earlier event can be recorded after someone was tagged — migration 180 did
-- exactly that, finding July and September set joins for people tagged at
-- their October visit — and the earlier row then looks like a fresh
-- first-timer. The welcome automation removes the tag after emailing, so a
-- second tag would mean a second welcome email. Anyone with a tagged row is
-- done for good.

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
    and not exists (
      select 1
      from public.event_attendance t
      where t.email = a.email
        and t.first_timer_tagged_at is not null
    )
  order by j.starts_at, a.id;
$$;

revoke all on function public.event_first_timers_to_tag() from public, anon, authenticated;
grant execute on function public.event_first_timers_to_tag() to service_role;
