-- Migration 174: a public jam's full address is only readable by people who
-- have RSVP'd, not by anyone holding the anon key.
--
-- The "read jams" policy lets anyone read a community jam, and RLS is row-level,
-- so until now `select full_address from jams` returned every public jam's
-- street address — including hosts' homes — to anyone. The page hid it; the
-- API didn't.
--
-- full_address is taken out of the column grants for anon and authenticated, so
-- jam_full_address() (migration 173) is the only way a client reads it. Writes
-- are unchanged: hosts still insert and update the column directly.
--
-- Apply only after the app code that stopped selecting full_address directly
-- has deployed — web and native both.
--
-- ⚠ Column grants don't extend themselves. A column added to jams later is NOT
-- readable by anon/authenticated until a migration grants it, and any client
-- `select('*')` on jams fails outright.

revoke select on public.jams from anon, authenticated;

grant select (
  id, host_user_id, starts_at, ends_at, timezone, neighborhood, notes, visibility,
  created_at, name, tickets_url, image_url, capacity, image_focal_point,
  guests_can_invite, ticket_limit, short_code, image_desktop_url, image_mobile_url,
  image_list_url, image_crops
) on public.jams to anon, authenticated;
