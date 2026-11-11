-- Migration 185: official events have no co-hosts.
--
-- A co-host can do everything canManageJam allows: change ticket tiers and
-- prices, make promo codes, read the buyer list, check people in, message
-- attendees and add leaders. On an official event that is the org's Stripe
-- account, and the org already has a role for running its events
-- (profiles.can_host_official, migration 156), which manages every official
-- event. So a co-host there either duplicates that or hands it to someone
-- outside that short list. Community jams keep co-hosts.
--
-- Enforced here rather than in each route: seven places check co-host status
-- (the web API and the jam_full_address functions), and the RLS insert policy
-- lets a host add a co-host directly with the public key.

delete from public.jam_cohosts c
using public.jams j
where j.id = c.jam_id and j.visibility = 'official';

create or replace function public.jam_cohosts_not_official()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.jams where id = new.jam_id and visibility = 'official') then
    raise exception 'Official events do not have co-hosts' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.jam_cohosts_not_official() from public, anon, authenticated;

create trigger jam_cohosts_not_official
  before insert or update on public.jam_cohosts
  for each row execute function public.jam_cohosts_not_official();

-- A community jam turned official drops its co-hosts.
create or replace function public.jams_drop_cohosts_when_official()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.jam_cohosts where jam_id = new.id;
  return new;
end;
$$;

revoke execute on function public.jams_drop_cohosts_when_official() from public, anon, authenticated;

create trigger jams_drop_cohosts_when_official
  after update of visibility on public.jams
  for each row
  when (new.visibility = 'official' and old.visibility is distinct from 'official')
  execute function public.jams_drop_cohosts_when_official();
