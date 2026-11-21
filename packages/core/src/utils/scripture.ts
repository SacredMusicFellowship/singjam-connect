// Scripture references on texts (text_sources, migration 208) are stored in
// Hebrew (Masoretic) numbering. Greek/Latin numbering — the Septuagint and the
// Vulgate, still used in Orthodox and some Catholic books — numbers most psalms
// one lower: Hebrew 9–10 are one psalm (9), 114–115 are one (113), 116 and 147
// are each split in two.

export type ScriptureRef = {
  book: string | null;
  chapter_start: number | null;
  verse_start: number | null;
  chapter_end?: number | null;
  verse_end?: number | null;
  citation?: string | null;
};

// "Psalms 133:1", "1 Chronicles 17:16–17", "Psalms 23", or the citation for a
// non-scripture source ("Masnavi I.1").
export function formatScriptureRef(r: ScriptureRef): string {
  if (!r.book) return r.citation ?? "";
  const book = r.book === "Psalms" && r.chapter_start && !r.chapter_end ? "Psalm" : r.book;
  if (!r.chapter_start) return book;
  let out = `${book} ${r.chapter_start}`;
  if (r.verse_start) out += `:${r.verse_start}`;
  if (r.chapter_end && r.chapter_end !== r.chapter_start) out += `–${r.chapter_end}${r.verse_end ? `:${r.verse_end}` : ""}`;
  else if (r.verse_end && r.verse_end !== r.verse_start) out += `–${r.verse_end}`;
  return out;
}

// A Hebrew-numbered psalm in Greek/Latin numbering.
export function psalmToGreekNumbering(hebrew: number): number {
  if (hebrew <= 8 || hebrew >= 148) return hebrew;
  if (hebrew <= 10) return 9;
  if (hebrew <= 113) return hebrew - 1;
  if (hebrew <= 115) return 113;
  if (hebrew === 116) return 114; // 116:1–9 is Greek 114, 116:10–19 is 115
  if (hebrew <= 146) return hebrew - 1;
  return 146; // 147:1–11 is Greek 146, 147:12–20 is 147
}

// Book names for the scripture picker (English names, Hebrew Bible then New Testament).
export const TANAKH_BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
  "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
  "Ecclesiastes", "Song of Songs", "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
];
export const NEW_TESTAMENT_BOOKS = [
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
  "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon",
  "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation",
];

// A text's source as stored (text_sources): where the words come from and how
// they use it. `corpus` is null for sources entered before it was read.
export type SourceRef = ScriptureRef & { corpus?: string | null; relation?: string | null };

const BOOKS = [...TANAKH_BOOKS, ...NEW_TESTAMENT_BOOKS];
export const scriptureBookSlug = (book: string) => book.toLowerCase().replace(/\s+/g, "-");
export function scriptureBookFromSlug(slug: string): string | null {
  return BOOKS.find((b) => scriptureBookSlug(b) === slug.toLowerCase()) ?? null;
}

// Every view says how the words use their source: quoted words show the
// passage ("Psalm 133:1"), a paraphrase or metrical version is "after" it
// ("after Psalm 90"), and inspiration is only "inspired by" (never shown as the
// source on a song or card).
export function formatSourceRef(r: SourceRef): string {
  const ref = formatScriptureRef(r);
  if (!ref || !r.book) return ref;
  if (r.relation === "paraphrase" || r.relation === "metrical") return `after ${ref}`;
  if (r.relation === "inspired") return `inspired by ${ref}`;
  return ref;
}

export const capitalizeFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// The browse key of a passage's page: "psalms/90", or the book ("psalms").
export function scriptureKey(r: { book: string | null; chapter_start?: number | null }): string | null {
  if (!r.book || !scriptureBookFromSlug(scriptureBookSlug(r.book))) return null;
  return r.chapter_start ? `${scriptureBookSlug(r.book)}/${r.chapter_start}` : scriptureBookSlug(r.book);
}

// Where to read a passage: Sefaria for the Hebrew Bible (Hebrew and English),
// Bible Gateway (NRSVue, which includes the Apocrypha) for the rest.
export function scriptureReadUrl(r: SourceRef): { href: string; site: string } | null {
  if (!r.book) return null;
  const hebrew = r.corpus ? r.corpus === "tanakh" : TANAKH_BOOKS.includes(r.book);
  const ch = r.chapter_start;
  if (hebrew) {
    let ref = r.book.replace(/\s+/g, "_");
    if (ch) {
      ref += `.${ch}`;
      if (r.verse_start) ref += `.${r.verse_start}`;
      if (r.chapter_end && r.chapter_end !== ch) ref += `-${r.chapter_end}${r.verse_end ? `.${r.verse_end}` : ""}`;
      else if (r.verse_end && r.verse_end !== r.verse_start) ref += `-${r.verse_end}`;
    }
    return { href: `https://www.sefaria.org/${encodeURI(ref)}?lang=bi`, site: "Sefaria" };
  }
  if (r.corpus && !["new_testament", "apocrypha"].includes(r.corpus)) return null;
  const search = formatScriptureRef({ ...r, book: r.book }).replace(/^Psalm /, "Psalms ").replace(/–/g, "-");
  return { href: `https://www.biblegateway.com/passage/?search=${encodeURIComponent(search)}&version=NRSVUE`, site: "Bible Gateway" };
}

// A text's sources in the order every view lists them: quoted, then metrical and
// paraphrase, then inspiration; scripture in canonical order, then citations.
export function sortSources<T extends SourceRef>(refs: T[]): T[] {
  const rank = (r: SourceRef) => ["quoted", "metrical", "paraphrase", "inspired"].indexOf(r.relation ?? "quoted");
  const book = (r: SourceRef) => (r.book && BOOKS.includes(r.book) ? BOOKS.indexOf(r.book) : BOOKS.length);
  return [...refs].sort((a, b) =>
    rank(a) - rank(b) || book(a) - book(b) || (a.chapter_start ?? 0) - (b.chapter_start ?? 0) || (a.verse_start ?? 0) - (b.verse_start ?? 0)
    || (a.citation ?? "").localeCompare(b.citation ?? ""));
}
