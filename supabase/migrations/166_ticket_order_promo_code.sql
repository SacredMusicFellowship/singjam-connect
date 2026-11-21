-- Which promo code an order used. Stripe counts a code's uses only for orders
-- it charges, but an order the code makes free never reaches Stripe, so those
-- uses were invisible: the ticket manager showed 0 for a code people had used.
-- Recorded at checkout; the ticket manager adds the free orders to Stripe's
-- count.
alter table public.ticket_orders
  add column if not exists promo_code_id uuid references public.ticket_promo_codes(id) on delete set null;

create index if not exists ticket_orders_promo_code_id_idx
  on public.ticket_orders (promo_code_id)
  where promo_code_id is not null;
