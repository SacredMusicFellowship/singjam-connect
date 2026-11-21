import { isValidTimeZone } from "@singjam/core";

// An event's times are quoted in the venue's zone, so the zone comes from the
// address, not from whichever device the host happens to be typing on.
export async function timezoneForAddress(address: string): Promise<string | null> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!key || !address.trim()) return null;
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.timeZone" },
      body: JSON.stringify({ textQuery: address, pageSize: 1 }),
    });
    if (!res.ok) return null;
    const tz = (await res.json()).places?.[0]?.timeZone?.id;
    return isValidTimeZone(tz) ? tz : null;
  } catch {
    return null;
  }
}
