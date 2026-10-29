import { resend, FROM_ADDRESS } from "@/lib/resend";
import { sideEffectsBlocked } from "@/lib/devSafety";

const AC_API_URL = process.env.AC_API_URL;
const AC_API_KEY = process.env.AC_API_KEY;

const LIST_IDS = ["1", "4", "9"]; // Sacred Music Fellowship, SingJam, SMF General Announcements
const TAG_ID = "24"; // SingJam App User

// Maps app instrument names to AC INSTRUMENTS checkbox values (field 29)
const INSTRUMENT_MAP: Record<string, string> = {
  "Guitar": "Guitar",
  "Electric Bass": "Bass",
  "Upright Bass": "Bass",
  "Piano/Keys": "Piano/Keyboard",
  "Drums": "Drums",
  "Percussion": "Percussion",
  "Violin/Fiddle": "Violin",
  "Cello": "Cello",
  "Banjo": "Banjo",
  "Mandolin": "Mandolin",
  "Ukulele": "Ukulele",
  "Flute": "Flute",
  "Clarinet": "Clarinet",
  "Saxophone": "Saxophone",
  "Trumpet": "Trumpet",
  "Trombone": "Trombone",
  "Harmonica": "Harmonica",
  "Accordion": "Accordion",
  "Organ": "Organ",
  "Ney": "Ney",
  "Oud": "Oud",
};

// Maps app genre names to AC MUSIC_PREFERENCES checkbox values (field 30)
const GENRE_MAP: Record<string, string> = {
  "Rock": "Rock",
  "Folk Rock": "Folk",
  "Country Rock": "Country / Bluegrass",
  "Hard Rock": "Hard Rock / Metal",
  "Heavy Metal": "Hard Rock / Metal",
  "Metal": "Hard Rock / Metal",
  "Punk": "Punk Rock",
  "Post-Punk": "Punk Rock",
  "Jazz": "Jazz",
  "Folk": "Folk",
  "Blues": "Blues",
  "Soul": "Soul / R&B",
  "R&B": "Soul / R&B",
  "Country": "Country / Bluegrass",
  "Bluegrass": "Country / Bluegrass",
  "Outlaw Country": "Country / Bluegrass",
  "Western Swing": "Country / Bluegrass",
  "Americana": "Country / Bluegrass",
  "Reggae": "Reggae",
  "Latin": "Latin",
  "Salsa": "Latin",
  "Tango": "Latin",
  "Bossa Nova": "Latin",
  "Gospel": "Christian / Gospel music",
  "Christian": "Christian / Gospel music",
  "Contemporary Christian": "Christian / Gospel music",
  "Hymns": "Christian / Gospel music",
  "Worship": "Christian / Gospel music",
  "Klezmer": "Jewish music",
  "Spiritual": "Non-denominational sacred music",
};

// AC occasionally rejects a single call with a 429 or 5xx in the middle of an
// otherwise healthy sync, so those are retried before being reported as failures.
const RETRY_DELAYS_MS = [1000, 3000];

async function acFetch(path: string, options: RequestInit) {
  if (!AC_API_URL || !AC_API_KEY) return null;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${AC_API_URL}/api/3${path}`, {
      ...options,
      headers: {
        "Api-Token": AC_API_KEY,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
    const text = await res.text();
    if (res.ok) return text ? JSON.parse(text) : {};
    const retryable = res.status === 429 || res.status >= 500;
    console.error(`[ActiveCampaign] ${options.method ?? "GET"} ${path} → ${res.status}`, text);
    if (!retryable || attempt >= RETRY_DELAYS_MS.length) return null;
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }
}

export interface ContactProfile {
  firstName?: string;
  lastName?: string;
  neighborhood?: string;
  singingVoice?: string[];
  instrumentLevels?: Record<string, string>;
  favoriteGenres?: string[];
}

// Upserts the contact, subscribes to all lists, applies the SingJam App User tag,
// and syncs any profile fields provided. Safe to call on every signup and profile save.
// Pass `tag: false` for people without an account (guest ticket buyers who opted
// in) — the tag means "has a SingJam account".
// Returns an array of failure descriptions — empty means fully successful.
export async function syncContact(
  email: string,
  profile: ContactProfile = {},
  { tag = true }: { tag?: boolean } = {}
): Promise<string[]> {
  if (!AC_API_URL || !AC_API_KEY) return [];
  // Treated like an unconfigured key, so callers don't record a sync failure.
  if (sideEffectsBlocked(`ActiveCampaign sync for ${email}`)) return [];

  const fieldValues: { field: string; value: string }[] = [];

  if (profile.neighborhood) {
    fieldValues.push({ field: "18", value: profile.neighborhood });
  }

  // Map instruments; singing voice "lead"/"backup" → "Voice"
  const acInstruments = new Set<string>();
  const otherInstruments: string[] = [];
  if (profile.singingVoice?.some((v) => v === "lead" || v === "backup")) {
    acInstruments.add("Voice");
  }
  for (const instrument of Object.keys(profile.instrumentLevels ?? {})) {
    const mapped = INSTRUMENT_MAP[instrument];
    if (mapped) acInstruments.add(mapped);
    else if (instrument !== "Other") otherInstruments.push(instrument);
  }
  if (acInstruments.size > 0) {
    fieldValues.push({ field: "29", value: [...acInstruments].join("||") });
  }
  if (otherInstruments.length > 0) {
    fieldValues.push({ field: "39", value: otherInstruments.join(", ") });
  }

  // Map genres
  const acGenres = new Set<string>();
  const otherGenres: string[] = [];
  for (const genre of profile.favoriteGenres ?? []) {
    const mapped = GENRE_MAP[genre];
    if (mapped) acGenres.add(mapped);
    else otherGenres.push(genre);
  }
  if (acGenres.size > 0) {
    fieldValues.push({ field: "30", value: [...acGenres].join("||") });
  }
  if (otherGenres.length > 0) {
    fieldValues.push({ field: "38", value: otherGenres.join(", ") });
  }

  const contactData = await acFetch("/contact/sync", {
    method: "POST",
    body: JSON.stringify({
      contact: {
        email,
        ...(profile.firstName ? { firstName: profile.firstName } : {}),
        ...(profile.lastName ? { lastName: profile.lastName } : {}),
        ...(fieldValues.length ? { fieldValues } : {}),
      },
    }),
  });

  const contactId: string | undefined = contactData?.contact?.id;
  if (!contactId) {
    const failures = ["contact upsert returned no ID"];
    console.error(`[ActiveCampaign] contact upsert returned no ID for ${email}`);
    notifyAdminOfSyncFailure(email, failures).catch(() => {});
    return failures;
  }

  // Fetch current list memberships so we never resubscribe an explicit unsubscribe.
  const existingLists = await acFetch(`/contacts/${contactId}/contactLists`, { method: "GET" });
  const unsubscribedListIds = new Set<string>(
    (existingLists?.contactLists ?? [])
      .filter((cl: { status: string }) => cl.status === "2")
      .map((cl: { list: string }) => cl.list)
  );

  const subscribeIfAllowed = (listId: string) =>
    unsubscribedListIds.has(listId)
      ? Promise.resolve(true) // skip — honour the unsubscribe
      : acFetch("/contactLists", { method: "POST", body: JSON.stringify({ contactList: { contact: contactId, list: listId, status: 1 } }) });

  const [r1, r4, r9, rtag] = await Promise.all([
    subscribeIfAllowed("1"),
    subscribeIfAllowed("4"),
    subscribeIfAllowed("9"),
    tag
      ? acFetch("/contactTags", { method: "POST", body: JSON.stringify({ contactTag: { contact: contactId, tag: TAG_ID } }) })
      : Promise.resolve(true),
  ]);

  const failed = [
    !r1 && "list 1 (Sacred Music Fellowship)",
    !r4 && "list 4 (SingJam)",
    !r9 && "list 9 (SMF Announcements)",
    !rtag && "SingJam App User tag",
  ].filter(Boolean) as string[];

  if (failed.length > 0) {
    notifyAdminOfSyncFailure(email, failed).catch(() => {});
  }

  return failed;
}

// Permanently removes the contact from ActiveCampaign. Safe to call for
// emails with no matching contact — treated as already-deleted, not a failure.
export async function deleteContact(email: string): Promise<boolean> {
  if (!AC_API_URL || !AC_API_KEY) return true;
  if (sideEffectsBlocked(`ActiveCampaign delete for ${email}`)) return true;

  const found = await acFetch(`/contacts?email=${encodeURIComponent(email)}`, { method: "GET" });
  const contactId: string | undefined = found?.contacts?.[0]?.id;
  if (!contactId) return true;

  const result = await acFetch(`/contacts/${contactId}`, { method: "DELETE" });
  if (result === null) {
    console.error(`[ActiveCampaign] failed to delete contact ${contactId} for ${email}`);
    return false;
  }
  return true;
}

async function notifyAdminOfSyncFailure(userEmail: string, failures: string[]) {
  const adminEmail = process.env.ADMIN_EMAIL ?? "benkramarz@gmail.com";
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: adminEmail,
    subject: `[SingJam] ActiveCampaign sync failed for ${userEmail}`,
    html: [
      `<p>ActiveCampaign sync failed for <strong>${userEmail}</strong>.</p>`,
      `<p>Failed steps:</p>`,
      `<ul>${failures.map((f) => `<li>${f}</li>`).join("")}</ul>`,
      `<p><a href="https://singjam.org/admin/settings">Go to admin panel to resync →</a></p>`,
    ].join(""),
  });
}
