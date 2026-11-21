-- A set email invite stored only a token, so someone who signed up without
-- clicking that link (Apple, Google, the app) never got access. Keep the
-- address on the unclaimed row so sign-in can claim it by authenticated email,
-- the way jam_invites.invitee_email works. Cleared once claimed.
--
-- Unclaimed rows (user_id null, status pending) are visible only to the set
-- owner under set_collaborators_select, so the address is not exposed further.
alter table public.set_collaborators add column if not exists invitee_email text;

create index if not exists set_collaborators_invitee_email_idx
  on public.set_collaborators (invitee_email)
  where invitee_email is not null and user_id is null;
