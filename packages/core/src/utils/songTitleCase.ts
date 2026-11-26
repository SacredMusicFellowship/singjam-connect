const SMALL = new Set(["a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet", "of", "on", "in", "at", "to", "by", "up", "as", "o'er", "from", "with", "into"]);

const key = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’'‘`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
// "Jolene (song)" → "Jolene".
const bare = (s: string) => {
  const t = s.trim();
  const open = t.endsWith(")") ? t.lastIndexOf("(") : -1;
  return (open > 0 ? t.slice(0, open) : t).trim();
};

// "canticle of the turning" → "Canticle of the Turning".
export function titleCase(s: string): string {
  const words = s.toLowerCase().split(/(\s+)/);
  const last = words.length - 1;
  return words
    .map((w, i) => {
      if (!w.trim()) return w;
      if (i !== 0 && i !== last && SMALL.has(w)) return w;
      return w.replace(/(^|[-(“"])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
    })
    .join("");
}

// A title typed all in lower case (or all capitals) takes its casing from a
// source that prints the same title (a hymnal, the song's Wikipedia page),
// else plain title case. A title with any mixed case is kept as typed.
export function properSongTitle(typed: string, sourced: (string | null | undefined)[] = []): string {
  const letters = typed.replace(/[^\p{L}]/gu, "");
  const lower = letters === letters.toLowerCase();
  const upper = letters === letters.toUpperCase() && typed.trim().split(/\s+/).length > 1;
  if (!letters || (!lower && !upper)) return typed;
  const match = sourced.map((t) => (t ? bare(t) : "")).find((t) => t && key(t) === key(typed) && t !== t.toLowerCase());
  return match ?? titleCase(typed.trim());
}
