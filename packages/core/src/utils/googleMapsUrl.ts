/**
 * A Google Maps link for a venue, shared so web and native point at the same
 * place in the same way.
 *
 * Uses the documented Maps URLs scheme rather than a hand-rolled /maps?q= path:
 * it is the supported entry point, and on a phone it hands off to the installed
 * Maps app instead of opening a browser tab.
 *
 * The caller decides *what* to pass, and that matters — a jam whose exact
 * address is only shown after RSVP must link to the neighbourhood, not the
 * street address, or the link leaks what the page deliberately withholds.
 */
export function googleMapsUrl(query: string | null | undefined): string | null {
  const q = (query ?? "").trim();
  // "TBD" is a placeholder the app writes when a host has not picked a venue —
  // linking it would send people to whatever Maps guesses TBD means.
  if (!q || q.toUpperCase() === "TBD") return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
