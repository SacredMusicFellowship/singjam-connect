-- Migration 253: Community Weavers on official events
--
-- A Community Weaver is added, comped, badged and stepped down exactly like a
-- music leader (migration 172), so they share jam_leaders and its comp ticket
-- (ticket_orders.source = 'leader'). A person holds one role per event: the
-- existing (jam_id, user_id) and (jam_id, email) unique indexes still apply.

alter table public.jam_leaders
  add column if not exists role text not null default 'leader';

alter table public.jam_leaders drop constraint if exists jam_leaders_role_check;
alter table public.jam_leaders
  add constraint jam_leaders_role_check check (role in ('leader', 'weaver'));
