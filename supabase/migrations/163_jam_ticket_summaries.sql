-- Migration 163: one-shot ticket summary for jam listings.
--
-- The home page and /jams show official events in a list. Until now the only
-- ticket signal there was the external tickets_url, so an event selling on our
-- own site rendered no ticket affordance at all. Showing price and sold-out
-- state needs per-tier availability, which is ticket_type_sold_count() per
-- tier — far too chatty to run from a listing one tier at a time.
--
-- This rolls the whole listing's worth of tiers into a single call. The
-- per-tier availability rule is NOT restated here: it calls the same
-- ticket_type_sold_count() the reservation guard uses, so a listing can never
-- advertise stock the oversell guard would refuse.
--
-- SECURITY DEFINER, like the count functions it wraps (they read ticket_orders
-- and tickets, which grant nothing to anon/authenticated). Definer bypasses
-- RLS, so the jams join is restricted to visibility = 'official' — those rows
-- are world-readable under the "read jams" policy anyway (migration 160), so
-- this exposes nothing a caller could not already read. Ticket tiers only
-- exist on official events, so that is also the complete useful scope.

create or replace function public.jam_ticket_summaries(jam_ids uuid[])
returns table (
  jam_id uuid,
  tier_count integer,
  on_sale_count integer,
  min_price_cents integer,
  currency text,
  sold_out boolean,
  next_sales_start_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with tiers as (
    select
      t.jam_id,
      t.price_cents,
      t.currency,
      t.sales_start_at,
      -- null quantity = uncapped, which is never sold out.
      case
        when t.quantity is null then null
        else greatest(0, t.quantity - public.ticket_type_sold_count(t.id))
      end as remaining,
      coalesce(t.sales_start_at > now(), false) as not_yet_open,
      coalesce(t.sales_end_at < now(), false) as closed
    from public.ticket_types t
    join public.jams j on j.id = t.jam_id
    where t.jam_id = any(jam_ids)
      and j.visibility = 'official'
  ),
  priced as (
    select
      tiers.*,
      not not_yet_open and not closed and (remaining is null or remaining > 0) as on_sale
    from tiers
  )
  select
    priced.jam_id,
    count(*)::int,
    count(*) filter (where on_sale)::int,
    -- Cheapest tier a buyer can actually take right now, so "From $15" always
    -- names a purchasable ticket. Null when nothing is on sale.
    min(price_cents) filter (where on_sale)::int,
    (array_agg(currency order by price_cents) filter (where on_sale))[1],
    -- Uncapped tiers (null remaining) coalesce to "has stock" so they never
    -- read as sold out, and an all-closed event falls back to false — that is
    -- "sales closed", which the caller derives from on_sale_count instead.
    coalesce(bool_and(coalesce(remaining, 1) = 0) filter (where not closed), false),
    min(sales_start_at) filter (where not_yet_open)
  from priced
  group by priced.jam_id;
$$;

grant execute on function public.jam_ticket_summaries(uuid[]) to anon, authenticated, service_role;

comment on function public.jam_ticket_summaries(uuid[]) is
  'Per-jam ticket state for listings: cheapest on-sale price, sold-out flag, next sales opening. Official events only.';
