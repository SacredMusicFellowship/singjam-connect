-- Migration 184: save a set's new song order in one statement.
--
-- The reorder API used to update each song's position in its own request, all
-- at once. Two quick reorders (two drags, or marking a song played and then
-- unplayed) could interleave row by row and leave the set in an order nobody
-- chose. One UPDATE locks every row it touches, so a second reorder waits for
-- the first and the set always ends in one complete order.
--
-- Called only by the web API's service-role client after it has checked the
-- caller is the owner or a co-owner, so it is not exposed to anon or signed-in
-- clients.

create or replace function public.reorder_set_songs(p_set_id uuid, p_order jsonb)
returns void
language sql
set search_path = public
as $$
  update public.set_songs ss
  set position = o.position
  from jsonb_to_recordset(p_order) as o(id uuid, position int)
  where ss.id = o.id and ss.set_id = p_set_id;
$$;

revoke execute on function public.reorder_set_songs(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.reorder_set_songs(uuid, jsonb) to service_role;
