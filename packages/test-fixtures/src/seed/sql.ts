// Small, strict SQL literal helpers for generating seed files. Values come from the fixtures,
// never from users, but they're still escaped properly so a stray quote can't break a seed.

export type SqlValue = string | number | boolean | null | SqlRaw;

export class SqlRaw {
  constructor(readonly sql: string) {}
}

export const raw = (sql: string) => new SqlRaw(sql);

export function literal(value: SqlValue): string {
  if (value === null) return "null";
  if (value instanceof SqlRaw) return value.sql;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Cannot write ${value} to SQL`);
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return `'${value.replace(/'/g, "''")}'`;
}

export const textArray = (values: readonly string[]) =>
  raw(values.length ? `array[${values.map(literal).join(", ")}]::text[]` : "'{}'::text[]");

export const uuidArray = (values: readonly string[]) =>
  raw(values.length ? `array[${values.map(literal).join(", ")}]::uuid[]` : "'{}'::uuid[]");

export const jsonb = (value: unknown) => raw(`${literal(JSON.stringify(value))}::jsonb`);

// Fixture timestamps are relative to an anchor (FIXED_NOW). Writing them as an offset from now()
// keeps upcoming jams upcoming whenever the seed is loaded.
export function relativeTimestamp(iso: string | null, anchor: Date): SqlValue {
  if (iso === null) return null;
  const seconds = Math.round((new Date(iso).getTime() - anchor.getTime()) / 1000);
  if (seconds === 0) return raw("now()");
  return raw(`now() ${seconds < 0 ? "-" : "+"} interval '${Math.abs(seconds)} seconds'`);
}

export function insert(table: string, rows: Record<string, SqlValue>[], conflict = ""): string {
  if (rows.length === 0) return `-- ${table}: no rows\n`;
  const columns = Object.keys(rows[0]);
  for (const row of rows) {
    const keys = Object.keys(row);
    if (keys.length !== columns.length || keys.some((k, i) => k !== columns[i])) {
      throw new Error(`Rows for ${table} don't share the same columns`);
    }
  }
  const values = rows.map((row) => `  (${columns.map((c) => literal(row[c])).join(", ")})`).join(",\n");
  return `insert into ${table} (${columns.join(", ")}) values\n${values}${conflict ? `\n${conflict}` : ""};\n`;
}
