// The public path to a jam or set page: its short code (migrations 169, 170)
// when we have it, otherwise the uuid, which the pages still accept.
// Only for the pages themselves — /jam/<id>/tickets, /edit and the like take
// the uuid, and native maps notification links straight to a uuid route.
type Linkable = { id: string; short_code?: string | null };

export function jamPath(jam: Linkable): string {
  return `/jam/${jam.short_code || jam.id}`;
}

export function setPath(set: Linkable): string {
  return `/set/${set.short_code || set.id}`;
}
