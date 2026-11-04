export type SetCollaboratorRole = "editor" | "viewer" | "co-owner";

// Roles allowed to add songs to a set. Viewers may open a set and read it, but
// not add — enforced in the web API's set routes, which are the single source
// of set authorization for both apps.
const CONTRIBUTOR_ROLES: readonly string[] = ["editor", "co-owner"];

// `role` is undefined for a set the user owns outright.
export function canContributeToSet(role: string | null | undefined): boolean {
  return role == null || CONTRIBUTOR_ROLES.includes(role);
}

// Narrows a picker's list of sets to the ones the user may actually add songs
// to, so we never offer a target the API is going to reject with a 403.
export function setsAcceptingSongs<T extends { role?: string | null }>(sets: T[]): T[] {
  return sets.filter((s) => canContributeToSet(s.role));
}

// Reordering, removing, keys, played, notes and choosing other people as leader
// are for the owner and co-owners. Event ticket holders join as editors, so an
// editor is usually a guest in the crowd, not someone running the set.
export function canManageSet(isOwner: boolean, role: string | null | undefined): boolean {
  return isOwner || role === "co-owner";
}
