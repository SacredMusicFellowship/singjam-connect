// Words too generic to tell one venue from another, so they never count as a
// venue name being "repeated" or "missing" from a title.
const GENERIC_VENUE_WORDS = new Set(["the", "and", "pub", "bar", "cafe", "café", "inn", "hall", "club"]);

const significantWords = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !GENERIC_VENUE_WORDS.has(w));

/**
 * The address line without a leading venue name that the event's title already
 * gives, so "SingJam at the Starry Plough" isn't followed by "The Starry Plough
 * Pub, 3101 Shattuck Ave, …".
 *
 * Only the first comma-separated part is ever dropped, only when it has no
 * digits (a street line always does), and only when every distinctive word in
 * it is in the title — a jam at "Cedar Rose Park" whose title doesn't mention
 * the park keeps it.
 */
export function dropVenueRepeatedInTitle(address: string, title: string | null | undefined): string {
  const parts = address.split(",").map((p) => p.trim());
  if (parts.length < 2 || !title) return address;
  const [first, ...rest] = parts;
  if (/\d/.test(first)) return address;
  const venueWords = significantWords(first);
  if (venueWords.length === 0) return address;
  const titleWords = new Set(significantWords(title));
  return venueWords.every((w) => titleWords.has(w)) ? rest.join(", ") : address;
}

/**
 * The address without a trailing ", USA" (or "United States"): every SingJam
 * event so far is in the US, and Google's suggestions append it to every
 * address. Other countries are kept.
 */
export function dropUsCountry(address: string): string {
  return address.replace(/,\s*(USA|United States( of America)?)\s*$/i, "");
}
