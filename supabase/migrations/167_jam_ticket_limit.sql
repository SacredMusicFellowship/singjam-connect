-- Migration 167: an optional cap on the total tickets an event sells.
--
-- Until now the only stock control was each tier's own quantity, so a 100-seat
-- room split across Advance and Day-Of had to guess the split up front. This
-- adds one number for the whole event. Both limits apply: a tier can still have
-- its own cap inside the event total, and either can be left null for none.
--
-- Deliberately not jams.capacity. That is the RSVP cap, and ticket sales were
-- kept independent of it on purpose; reusing it would change what an existing
-- number means on every event that already has one.

alter table public.jams
  add column if not exists ticket_limit integer
    check (ticket_limit is null or ticket_limit > 0);

-- The event-wide twin of ticket_type_sold_count: same rule for what counts
-- against stock (paid, or pending and unexpired), summed across every tier.
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
    and (
      o.status = 'paid'
      or (o.status = 'pending' and o.expires_at > now())
    );
$$;

-- Server-only (completed in migration 168). Listings reach it through
-- jam_ticket_tiers, which runs as definer.
revoke all on function public.jam_ticket_sold_count(uuid) from public;
grant execute on function public.jam_ticket_sold_count(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Reservation: unchanged from migration 153 except for the event-total check
-- after the loop.
-- ---------------------------------------------------------------------------

create or replace function public.reserve_ticket_order(
  jam_id_param uuid,
  buyer_param uuid,
  items jsonb,
  hold_minutes integer default 35,
  buyer_email_param text default null,
  buyer_name_param text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_type public.ticket_types;
  v_qty integer;
  v_available integer;
  v_total integer := 0;
  v_requested integer := 0;
  v_currency text;
  v_limit integer;
begin
  if buyer_param is null and (buyer_email_param is null or btrim(buyer_email_param) = '') then
    raise exception 'a buyer account or email is required';
  end if;

  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'no ticket items supplied';
  end if;

  -- Serialize concurrent reservations for this jam. Without this lock two
  -- buyers can both read "1 left", both pass the check, and both pay. It also
  -- covers the event-total check below, which reads the same jam's tickets.
  perform 1
  from public.ticket_types
  where jam_id = jam_id_param
  order by id
  for update;

  for v_item in select * from jsonb_array_elements(items)
  loop
    v_qty := coalesce((v_item ->> 'quantity')::int, 0);
    if v_qty <= 0 then
      raise exception 'quantity must be positive';
    end if;

    select * into v_type
    from public.ticket_types
    where id = (v_item ->> 'ticket_type_id')::uuid
      and jam_id = jam_id_param;

    if v_type.id is null then
      raise exception 'ticket type % not found for this jam', v_item ->> 'ticket_type_id';
    end if;

    if v_type.sales_start_at is not null and now() < v_type.sales_start_at then
      raise exception 'sales for % have not opened', v_type.name;
    end if;
    if v_type.sales_end_at is not null and now() > v_type.sales_end_at then
      raise exception 'sales for % have closed', v_type.name;
    end if;

    if v_currency is null then
      v_currency := v_type.currency;
    elsif v_currency <> v_type.currency then
      raise exception 'mixed currencies in one order';
    end if;

    if v_type.quantity is not null then
      v_available := v_type.quantity - public.ticket_type_sold_count(v_type.id);
      if v_available < v_qty then
        raise exception 'only % left of %', greatest(v_available, 0), v_type.name;
      end if;
    end if;

    v_total := v_total + (v_type.price_cents * v_qty);
    v_requested := v_requested + v_qty;

    if v_order_id is null then
      insert into public.ticket_orders
        (jam_id, buyer_user_id, buyer_email, buyer_name, amount_cents, currency, expires_at)
      values
        (jam_id_param, buyer_param, nullif(btrim(coalesce(buyer_email_param, '')), ''),
         nullif(btrim(coalesce(buyer_name_param, '')), ''), 0, v_currency,
         now() + make_interval(mins => greatest(hold_minutes, 1)))
      returning id into v_order_id;
    end if;

    insert into public.tickets (order_id, ticket_type_id, jam_id, holder_user_id, holder_name, holder_email)
    select v_order_id, v_type.id, jam_id_param, buyer_param,
           nullif(btrim(coalesce(buyer_name_param, '')), ''),
           nullif(btrim(coalesce(buyer_email_param, '')), '')
    from generate_series(1, v_qty);
  end loop;

  -- Checked once the whole order is in, because the total spans tiers. This
  -- order's tickets are already inserted and pending, so they are inside the
  -- count; raising rolls them back with everything else.
  select ticket_limit into v_limit from public.jams where id = jam_id_param;
  if v_limit is not null then
    v_available := v_limit - (public.jam_ticket_sold_count(jam_id_param) - v_requested);
    if v_available < v_requested then
      raise exception 'only % tickets left for this event', greatest(v_available, 0);
    end if;
  end if;

  update public.ticket_orders
     set amount_cents = v_total,
         currency = v_currency,
         updated_at = now()
   where id = v_order_id;

  return v_order_id;
end;
$$;

revoke all on function public.reserve_ticket_order(uuid, uuid, jsonb, integer, text, text) from public;
grant execute on function public.reserve_ticket_order(uuid, uuid, jsonb, integer, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Listing availability: a tier's remaining is now also bounded by what the
-- event has left, so a card can't advertise stock the reservation would refuse.
-- least() ignores nulls, so an uncapped side simply drops out; both null stays
-- null (uncapped).
-- ---------------------------------------------------------------------------

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
    least(
      case
        when t.quantity is null then null
        else greatest(0, t.quantity - public.ticket_type_sold_count(t.id))
      end,
      case
        when j.ticket_limit is null then null
        else greatest(0, j.ticket_limit - public.jam_ticket_sold_count(j.id))
      end
    ),
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
