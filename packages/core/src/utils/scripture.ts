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
