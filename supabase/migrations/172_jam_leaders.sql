-- Migration 172: music leaders on official events
--
-- A leader is someone the host has already lined up to lead songs. Adding them
-- is the confirmation — there is no accept step — so the row exists exactly
-- while they are leading, and withdrawing deletes it.
--
-- On an official event a leader gets a comp ticket: a real tickets row, so the
-- door list, check-in and the QR email all work unchanged. It belongs to an
-- order with source = 'leader' and no tier, which keeps it out of revenue and
-- out of both stock limits. A leader is not a sale; adding one must never make
-- the event sell out sooner.

-- ---------------------------------------------------------------------------
-- Leader comps on the existing ticket tables
-- ---------------------------------------------------------------------------

alter table public.ticket_orders
  add column if not exists source text not null default 'purchase';

alter table public.ticket_orders drop constraint if exists ticket_orders_source_check;
alter table public.ticket_orders
  add constraint ticket_orders_source_check check (source in ('purchase', 'leader'));

-- A withdrawn leader's comp. Not 'refunded' (nothing was charged) and not
-- 'failed' (nothing went wrong); every query that counts tickets selects
-- 'paid' or 'pending', so this drops out of all of them on its own.
alter table public.ticket_orders drop constraint if exists ticket_orders_status_check;
alter table public.ticket_orders
  add constraint ticket_orders_status_check
  check (status in ('pending', 'paid', 'failed', 'expired', 'refunded', 'cancelled'));

-- A leader's ticket has no tier. ticket_type_sold_count filters on the tier, so
-- a null here is what keeps leaders out of every tier's cap.
alter table public.tickets alter column ticket_type_id drop not null;

-- The event-total twin of the above (migration 167), now excluding leaders the
-- same way. reserve_ticket_order and jam_ticket_tiers both call this, so the
-- purchase guard and the listings stay in step.
create or replace function public.jam_ticket_sold_count(jam_id_param uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.tickets t
  join public.ticket_orders o on o.id = t.order_id
  where t.jam_id = jam_id_param
    and o.source = 'purchase'
    and (
      o.status = 'paid'
      or (o.status = 'pending' and o.expires_at > now())
    );
$$;

revoke all on function public.jam_ticket_sold_count(uuid) from public, anon, authenticated;
grant execute on function public.jam_ticket_sold_count(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Leaders
-- ---------------------------------------------------------------------------

create table if not exists public.jam_leaders (
  id uuid primary key default gen_random_uuid(),
  jam_id uuid not null references public.jams(id) on delete cascade,
  -- Null for a leader without an account. They still get a ticket by email,
  -- the same way a guest buyer does.
  user_id uuid references public.profiles(id) on delete cascade,
  name text,
  email text,
  -- Leading is public by default; the leader can take themselves off the
  -- event page without stepping down.
  show_publicly boolean not null default true,
  -- The credential in the leader's email links ("Can't make it", "Hide me"),
  -- so someone without an account can still manage their own spot.
  token uuid not null unique default gen_random_uuid(),
  order_id uuid references public.ticket_orders(id) on delete set null,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint jam_leaders_identity check (user_id is not null or email is not null)
);

create unique index if not exists jam_leaders_jam_user_idx
  on public.jam_leaders (jam_id, user_id) where user_id is not null;
create unique index if not exists jam_leaders_jam_email_idx
  on public.jam_leaders (jam_id, lower(email)) where user_id is null;
create index if not exists jam_leaders_jam_idx on public.jam_leaders (jam_id, created_at, id);

-- Server-only, like ticket_orders (migration 152): rows carry emails and the
-- token that acts on a leader's behalf. The public "Leading" list is served by
-- the web app with only names and profile links, so anon and authenticated get
-- no grants, and RLS is on with no policies as defense in depth.
alter table public.jam_leaders enable row level security;
grant select, insert, update, delete on public.jam_leaders to service_role;
