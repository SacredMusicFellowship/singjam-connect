import { sameArtist } from "./landmarkRecordings";

// Hymnary.org's search export (`&export=csv`): quoted fields, "" for a quote.
export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim())) rows.push(row);
  const [head, ...body] = rows;
  return head ? body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()]))) : [];
}

export type HymnaryTune = { name: string; composers: string[]; instances: number };
export type HymnaryText = {
  title: string;
  firstLine: string;
  authors: string[];
  sources: string;
  instances: number;
  url: string;
  tunes: HymnaryTune[];
};

const norm = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/&/g, " and ").replace(/[’'‘`]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/^the /, "");

const names = (field: string | undefined) => (field ?? "").split(";").map((n) => n.trim()).filter(Boolean);

// The search's texts whose title is this song's, most printed first.
export function hymnaryTextsFor(title: string, records: Record<string, string>[]): Omit<HymnaryText, "tunes">[] {
  return records
    .filter((r) => [r.textTitle, r.displayTitle].some((t) => t && norm(t) === norm(title)) && (!r.languages || /english/i.test(r.languages)))
    .map((r) => ({
      title: r.textTitle || r.displayTitle,
      firstLine: r.firstLine,
      authors: names(r.authors),
      sources: r.textSources ?? "",
      instances: Number(r.totalInstances) || 0,
      url: `https://hymnary.org/text/${r.textAuthNumber}`,
    }))
    .filter((t) => t.firstLine)
    .sort((a, b) => b.instances - a.instances);
}

export function hymnaryTunes(records: Record<string, string>[]): HymnaryTune[] {
  return records
    .map((r) => ({ name: r.tuneTitle, composers: names(r.composers), instances: Number(r.totalInstances) || 0 }))
    .filter((t) => t.name)
    .sort((a, b) => b.instances - a.instances);
}

const TRADITIONAL = new Set(["traditional", "anonymous", "unknown"]);
// The same person, allowing for middle names or initials ("Charles Albert
// Tindley" / "Charles A. Tindley"): same first and last name, and any middle
// names that both give agree at least in their initial.
export function samePerson(a: string, b: string): boolean {
  if (norm(a) === norm(b) || sameArtist(a, b)) return true;
  const x = norm(a).split(" "), y = norm(b).split(" ");
  if (x.length < 2 || y.length < 2 || x[0] !== y[0] || x[x.length - 1] !== y[y.length - 1]) return false;
  const mx = x.slice(1, -1), my = y.slice(1, -1);
  return mx.every((m, i) => !my[i] || m[0] === my[i][0]);
}

// The Hymnary text that is this song, or null. Hymnals print many texts under
// one title (Tindley's "Stand by Me" is not Ben E. King's), so its author has
// to be one of the song's writers; an authorless text counts only for a
// traditional song, only when widely printed, and only when it opens with the
// song's title (hymnals print Bonar's "I heard the voice of Jesus say" as
// "Shine On Me", authorless).
export function pickHymnaryText(texts: HymnaryText[], writers: string[], title: string): HymnaryText | null {
  const named = writers.filter((w) => !TRADITIONAL.has(norm(w)));
  const traditional = writers.length > 0 && named.length === 0;
  return (
    texts.find((t) =>
      t.authors.length
        ? t.authors.some((a) => named.some((w) => samePerson(a, w)))
        : traditional && t.instances >= 5 && ` ${norm(t.firstLine)} `.includes(` ${norm(title)} `),
    ) ?? null
  );
}
