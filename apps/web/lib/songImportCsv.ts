export type ImportRow = { title: string; artist: string; writers: string; tags: string; first_line: string };

function splitLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && inQuote && line[i + 1] === '"') { cur += '"'; i++; }
    else if (ch === '"') inQuote = !inQuote;
    else if (ch === "," && !inQuote) { cols.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  cols.push(cur.trim());
  return cols;
}

// Reads title, artist, writers, tags and first_line columns. With a header row the columns
// can come in any order; without one they are title, artist.
export function parseImportCsv(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = splitLine(lines[0]).map((c) => c.toLowerCase());
  const hasHeader = head.includes("title") || head.includes("song");
  const col = (name: string, fallback: number) => (hasHeader ? head.indexOf(name) : fallback);
  const at = { title: hasHeader ? Math.max(head.indexOf("title"), head.indexOf("song")) : 0, artist: col("artist", 1), writers: col("writers", -1), tags: col("tags", -1), first_line: hasHeader ? Math.max(head.indexOf("first_line"), head.indexOf("first line")) : -1 };
  return (hasHeader ? lines.slice(1) : lines)
    .map((line) => {
      const cols = splitLine(line);
      const get = (i: number) => (i >= 0 ? cols[i] ?? "" : "");
      return { title: get(at.title), artist: get(at.artist), writers: get(at.writers), tags: get(at.tags), first_line: get(at.first_line) };
    })
    .filter((r) => r.title);
}

// What the add route gets for one row. A row with writers but no artist is a
// song with no recording to match (a traditional song), so Spotify is skipped.
export function importRowBody(row: ImportRow) {
  return {
    title: row.title,
    artist: row.artist,
    ...(row.writers ? { writers: row.writers } : {}),
    ...(row.tags ? { tags: row.tags } : {}),
    ...(row.first_line ? { first_line: row.first_line } : {}),
    ...(row.writers && !row.artist ? { no_recording: true } : {}),
  };
}
