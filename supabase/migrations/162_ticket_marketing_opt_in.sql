-- Migration 162: remember whether a ticket buyer asked to hear from us
--
-- Guest checkout collects an email for one stated reason: to send the ticket.
-- Adding that address to a mailing list is a second purpose, so the buyer's
-- answer is recorded against the order rather than assumed. Keeping it here
-- rather than only in Stripe metadata means the org can evidence the consent
-- later, which is the entire point of asking.
--
-- Defaults to false: a row written by anything that predates this column, or by
-- a path that never asked, must not read as consent.
--
-- Members are not asked. Creating an account already subscribes them through
-- syncContact() on the auth routes, so a second question here would be noise.

alter table public.ticket_orders
  add column if not exists marketing_opt_in boolean not null default false;
