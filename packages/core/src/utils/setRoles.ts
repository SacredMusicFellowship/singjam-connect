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

// What one person can do with a set: open it (its owner, an accepted
// collaborator, or anyone when link sharing is public) and add songs to it (its
// owner, editors and co-owners). Pass the person's accepted collaborator role,
// or null when they aren't one.
export function setAccessFor(
  set: { owner_user_id: string | null; link_sharing?: string | null },
  userId: string,
  collaboratorRole: string | null,
): { canView: boolean; canAdd: boolean } {
  const isOwner = set.owner_user_id === userId;
  const canAdd = isOwner || (collaboratorRole != null && canContributeToSet(collaboratorRole));
  return { canView: isOwner || collaboratorRole != null || set.link_sharing === "public", canAdd };
}

// Reordering, removing, keys, played, notes and choosing other people as leader
// are for the owner and co-owners. Event ticket holders join as editors, so an
// editor is usually a guest in the crowd, not someone running the set.
export function canManageSet(isOwner: boolean, role: string | null | undefined): boolean {
  return isOwner || role === "co-owner";
}

// Guests can undo their own additions without touching anyone else's songs.
export function canRemoveSetSong(
  isOwner: boolean,
  role: string | null | undefined,
  addedByUserId: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (canManageSet(isOwner, role)) return true;
  return role === "editor" && !!userId && addedByUserId === userId;
}

// What each collaborator role can do, shown when inviting. Keep in step with
// canContributeToSet, canManageSet and canRemoveSetSong above and the
// self-leader rule in the set song API.
export const SET_ROLE_DESCRIPTIONS: Record<SetCollaboratorRole, string> = {
  "co-owner": "Co-owners can do everything you can except delete the set or assign other co-owners.",
  editor: "Editors can add songs, remove songs they added, and invite others.",
  viewer: "Viewers can see the set but can't add or change songs.",
};
