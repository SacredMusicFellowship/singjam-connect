-- Migration 165: store Stripe's processing fee per ticket order.
--
-- The ticket manager shows gross, Stripe fees and net. The fee only exists on
-- Stripe's balance transaction, so the orders route looks it up the first time
-- it sees a charged order and caches it here. NULL means "not looked up yet"
-- (or Stripe had not settled the balance transaction); comped orders never
-- reach Stripe and stay NULL, counted as no fee.

alter table public.ticket_orders
  add column if not exists stripe_fee_cents integer check (stripe_fee_cents >= 0);
