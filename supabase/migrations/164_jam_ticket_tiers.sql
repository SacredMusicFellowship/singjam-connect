-- Migration 164: return per-tier availability for a listing, not a rollup.
--
-- Replaces jam_ticket_summaries (migration 163), which did the same job but
-- folded the tiers into one row per jam in SQL. The rollup rules — cheapest
-- purchasable price, sold out, when sales next open — are display rules both
-- apps need, and as SQL aggregates they were reachable only by a live database.
-- Moving the fold into packages/core (summarizeTicketTiers) puts them under the
-- package's tests and keeps one implementation for web and native, which is
-- where CLAUDE.md wants a shared rule to live.
--
-- What stays here is the part only the database can answer: how much stock each
-- tier has left. It calls the same ticket_type_sold_count() the reservation
-- guard uses, so a listing can never advertise stock the oversell guard would
-- refuse.
--
-- SECURITY DEFINER, like the count function it wraps (ticket_orders and tickets
-- grant nothing to anon/authenticated). Definer bypasses RLS, so the jams join
-- is restricted to visibility = 'official' — those rows are world-readable
-- under the "read jams" policy (migration 160), so this exposes nothing a
-- caller could not already read, and ticket tiers only exist on official
-- events anyway.

drop function if exists public.jam_ticket_summaries(uuid[]);

create or replace function public.jam_ticket_tiers(jam_ids uuid[])
returns table (
  jam_id uuid,
  ticket_type_id uuid,
  price_cents integer,
  currency text,
  remaining integer,
  not_yet_open boolean,
  closed boolean,
  sales_start_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.jam_id,
    t.id,
    t.price_cents,
    t.currency,
    -- null quantity = uncapped, which is never sold out.
    case
      when t.quantity is null then null
      else greatest(0, t.quantity - public.ticket_type_sold_count(t.id))
    end,
    coalesce(t.sales_start_at > now(), false),
    coalesce(t.sales_end_at < now(), false),
    t.sales_start_at
  from public.ticket_types t
  join public.jams j on j.id = t.jam_id
  where t.jam_id = any(jam_ids)
    and j.visibility = 'official'
  order by t.jam_id, t.sort_order, t.id;
$$;

grant execute on function public.jam_ticket_tiers(uuid[]) to anon, authenticated, service_role;

comment on function public.jam_ticket_tiers(uuid[]) is
  'Per-tier price and remaining stock for listing cards. Official events only. Fold into a per-jam summary with summarizeTicketTiers() in packages/core.';
