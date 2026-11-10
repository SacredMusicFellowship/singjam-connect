import { TAG_TYPES, type TagType } from "@singjam/core";

export type TagSpec = { type: TagType; name: string };

const list = (input: unknown): string[] =>
  (Array.isArray(input) ? input : typeof input === "string" ? input.split(";") : [])
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);

// Writers sent with a new song, as a list or one "A; B" string.
export function parseWriters(input: unknown): string[] {
  const seen = new Set<string>();
  return list(input).filter((w) => !seen.has(w.toLowerCase()) && seen.add(w.toLowerCase()));
}

// Tags sent with a new song as "type:Name" ("form:Shanty; occasion:Pub sing").
// The type is required because names repeat across types (Cajun is a genre and a culture).
export function parseTagSpecs(input: unknown): TagSpec[] {
  const seen = new Set<string>();
  const specs: TagSpec[] = [];
  for (const raw of list(input)) {
    const at = raw.indexOf(":");
    const type = raw.slice(0, at).trim().toLowerCase() as TagType;
    const name = raw.slice(at + 1).trim();
    if (at < 1 || !name || !TAG_TYPES.includes(type)) continue;
    const key = `${type}:${name.toLowerCase()}`;
    if (!seen.has(key)) { seen.add(key); specs.push({ type, name }); }
  }
  return specs;
}
