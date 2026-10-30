// Who may edit or cancel a jam. Narrower than who may manage it: co-hosts run
// invites, messages and set lists, but changing or cancelling the jam itself
// stays with its host. An official event belongs to SingJam rather than to the
// account that created it, so anyone trusted to host official events
// (profiles.can_host_official, migration 156) may edit or cancel any of them.
// Enforced by the web API's jam routes; both apps use this to decide what to show.
export function canEditJam(
  jam: { host_user_id: string | null; visibility: string | null },
  user: { id: string; can_host_official?: boolean | null } | null,
): boolean {
  if (!user) return false;
  if (jam.host_user_id === user.id) return true;
  return jam.visibility === "official" && user.can_host_official === true;
}
