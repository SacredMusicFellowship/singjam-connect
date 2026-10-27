/**
 * The full street address for a place the user picked from Google's
 * autocomplete, so a venue is saved as "The Starry Plough Pub, 3101 Shattuck
 * Ave, Berkeley, CA 94705, USA" rather than the suggestion's own text, which
 * for a business leaves out the street number ("…, Shattuck Avenue, …").
 *
 * The venue name is kept in front when the formatted address doesn't already
 * start with it, so the map and the Maps link still find the venue. Any failure
 * (network, a key without Place Details enabled, no formattedAddress) returns
 * `fallback` — today's behaviour — rather than blocking the pick.
 */
export async function resolvePlaceAddress({
  placeId,
  mainText,
  fallback,
  apiKey,
  fetchImpl = fetch,
}: {
  placeId: string;
  mainText: string;
  fallback: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  try {
    const res = await fetchImpl(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "formattedAddress" },
    });
    if (!res.ok) return fallback;
    const json = await res.json();
    const formatted: unknown = json?.formattedAddress;
    if (typeof formatted !== "string" || !formatted.trim()) return fallback;
    return formatted.toLowerCase().startsWith(mainText.toLowerCase()) ? formatted : `${mainText}, ${formatted}`;
  } catch {
    return fallback;
  }
}
