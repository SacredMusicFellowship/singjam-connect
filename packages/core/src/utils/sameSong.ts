const words = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’'‘`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));

// "The Sounds of Silence" and "Sound of Silence" share a key; so do
// "(Sittin' On) The Dock of the Bay" and "Dock of the Bay".
export function songTitleKeys(title: string): string[] {
  // Bounded, and the bracket classes exclude their own opener, so a title like
  // "((((…" can't make the replace scan quadratically.
  const t = title.slice(0, 300);
  const full = words(t);
  const bare = words(t.replace(/\([^()]*\)|\[[^[\]]*\]/g, " "));
  const key = (w: string[]) => (w[0] === "the" ? w.slice(1) : w).join(" ");
  return [...new Set([key(full), key(bare)].filter(Boolean))];
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

export function isSameTitle(a: string, b: string): boolean {
  const ka = songTitleKeys(a), kb = songTitleKeys(b);
  if (ka.some((k) => kb.includes(k))) return true;
  // A typo or two in a longer title ("Save the Last Dance" / "Save the Last the Dance" is not this; "Litte"/"Little" is).
  return ka.some((x) => kb.some((y) => Math.min(x.length, y.length) >= 10 && editDistance(x, y) <= 2));
}

const artistKey = (s: string) => words(s).filter((w) => w !== "the").join(" ");

// Two artist keys are one act spelled differently: a typo is allowed in longer
// names, never in short ones ("Muse" / "Mase", "Toto" / "Tool").
function nearKeys(a: string, b: string): boolean {
  if (a === b) return true;
  const len = Math.min(a.length, b.length);
  const allowed = len < 5 ? 0 : len < 10 ? 1 : 2;
  return allowed > 0 && editDistance(a, b) <= allowed;
}

export function isSameArtistName(a: string, b: string): boolean {
  const ka = artistKey(a);
  return !!ka && ka === artistKey(b);
}

export function isSameArtistSpelling(typed: string, found: string): boolean {
  const a = artistKey(typed), b = artistKey(found);
  return !!a && !!b && nearKeys(a, b);
}

// The one name in `known` that the typed name spells, exactly or with a typo
// ("Fleewood Mac" → "Fleetwood Mac"). Null when none is close or two are equally close.
export function closestArtist(typed: string, known: string[]): string | null {
  const a = artistKey(typed);
  if (!a) return null;
  const close = known
    .map((name) => ({ name, key: artistKey(name) }))
    .filter((k) => k.key && nearKeys(a, k.key))
    .map((k) => ({ ...k, d: k.key === a ? 0 : editDistance(a, k.key) }))
    .sort((x, y) => x.d - y.d);
  if (!close.length) return null;
  return close.some((k) => k.d === close[0].d && k.key !== close[0].key) ? null : close[0].name;
}

// Same title allowing a typo even in a short one ("Everywere"), for songs by the
// same artist, where two near-identical titles are almost always one song.
export function isNearTitle(a: string, b: string): boolean {
  if (isSameTitle(a, b)) return true;
  const ka = songTitleKeys(a), kb = songTitleKeys(b);
  return ka.some((x) => kb.some((y) => Math.min(x.length, y.length) >= 5 && editDistance(x, y) <= 1));
}

// Same title plus a shared artist is the same song. Two different artists under
// one title are different songs ("Dreams" — Fleetwood Mac / The Cranberries)
// unless one is a cover listed on the other; with no artist on one side it's
// only a possible match, for the person adding it to decide.
export function sameSong(
  a: { title: string; artists: string[] },
  b: { title: string; artists: string[] },
): "same" | "possible" | false {
  if (!isSameTitle(a.title, b.title)) return false;
  const aa = a.artists.map(artistKey).filter(Boolean), bb = b.artists.map(artistKey).filter(Boolean);
  if (!aa.length || !bb.length) return "possible";
  return aa.some((x) => bb.some((y) => nearKeys(x, y))) ? "same" : false;
}
