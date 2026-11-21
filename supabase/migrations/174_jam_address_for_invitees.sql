-- Migration 174: someone invited to a public jam sees its full address too.
--
-- An invitee isn't a stranger: a host, or a guest who already has the address,
-- picked them by name. Only a pending invite counts — accepting one makes an
-- attending RSVP, which is already covered, and declining puts them back to the
-- neighbourhood.

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
        select 1 from public.jam_invites i
        where i.jam_id = j.id and i.invited_user_id = (select auth.uid()) and i.status = 'pending'
      )
      or exists (
        select 1 from public.jam_rsvps r
        where r.jam_id = j.id and r.user_id = (select auth.uid()) and r.status = 'attending'
      )
    );
$$;

revoke all on function public.jam_full_address(uuid) from public;
grant execute on function public.jam_full_address(uuid) to anon, authenticated, service_role;
