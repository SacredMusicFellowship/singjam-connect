-- Migration 168: make jam_ticket_sold_count (migration 167) server-only, as 167
-- intended. Its `revoke all … from public` left Supabase's default privileges in
-- place, which grant execute on new public functions to anon and authenticated
-- directly, so either role could still call it.

revoke execute on function public.jam_ticket_sold_count(uuid) from anon, authenticated;
