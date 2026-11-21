-- Migration 173: jam_full_address(), the one place that decides who may read a
-- jam's full street address.
--
-- Additive on its own. Migration 174 then takes full_address out of the client
-- column grants, which is what actually closes the leak; it is split out so the
-- app code that calls this function can deploy before direct reads stop working.

-- Who sees the full address: everyone for an official event (it's a public
-- venue) and a private one (the link is the invitation, migration 160); for a
-- public jam, the host, a co-host, or someone attending. Null otherwise, and for
-- an unknown id.
create or replace function public.jam_full_address(jam_id_param uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select j.full_address
  from public.jams j
  where j.id = jam_id_param
    and (
      j.visibility in ('official', 'private')
      or j.host_user_id = (select auth.uid())
      or exists (
        select 1 from public.jam_cohosts c
        where c.jam_id = j.id and c.user_id = (select auth.uid())
      )
      or exists (
        select 1 from public.jam_rsvps r
        where r.jam_id = j.id and r.user_id = (select auth.uid()) and r.status = 'attending'
      )
    );
$$;

revoke all on function public.jam_full_address(uuid) from public;
grant execute on function public.jam_full_address(uuid) to anon, authenticated, service_role;
