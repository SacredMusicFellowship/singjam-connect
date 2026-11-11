// Repo rules that have bitten us, checked on every PR (see CLAUDE.md).
// No dependencies; run with `node scripts/check-repo-rules.mjs`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const failures = [];
const fail = (file, rule) => failures.push(`${relative(root, file)}: ${rule}`);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", ".expo", "dist", "build", ".git", "ios", "android"].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// 1. Netlify treats every file in netlify/functions as a function; a test file
//    there fails the production deploy (2026-11-05).
const functionsDir = join(root, "apps/web/netlify/functions");
for (const name of readdirSync(functionsDir)) {
  if (!/^[A-Za-z0-9_-]+\.(ts|js|mjs)$/.test(name)) fail(join(functionsDir, name), "not a valid Netlify function name (keep tests and helpers outside netlify/functions)");
}

// 2. Every new table needs explicit grants: Supabase no longer auto-grants
//    access to the Data API. Checked from migration 201 on (older ones predate the rule).
const migrationsDir = join(root, "supabase/migrations");
const migrations = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
const seen = new Map();
for (const file of migrations) {
  const num = parseInt(file, 10);
  if (!Number.isFinite(num)) { fail(join(migrationsDir, file), "migration name must start with its number"); continue; }
  if (num >= 201 && seen.has(num)) fail(join(migrationsDir, file), `migration number ${num} is already used by ${seen.get(num)}`);
  seen.set(num, file);
  if (num < 201) continue;
  const sql = readFileSync(join(migrationsDir, file), "utf8").replace(/--.*$/gm, "");
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi)) {
    const table = m[1];
    for (const role of ["anon", "authenticated", "service_role"]) {
      const granted = new RegExp(`grant\\s+[^;]*\\bon\\s+(?:table\\s+)?(?:public\\.)?"?${table}"?\\s+to\\s+[^;]*\\b${role}\\b`, "i").test(sql);
      if (!granted) fail(join(migrationsDir, file), `table ${table} has no explicit grant to ${role}`);
    }
  }
}

// 3. jams uses column-level grants so full_address stays private: clients must
//    never select * from it.
for (const file of walk(join(root, "apps"))) {
  if (!/\.(ts|tsx|js|mjs)$/.test(file) || /\.test\./.test(file)) continue;
  const src = readFileSync(file, "utf8");
  if (/from\(\s*["'`]jams["'`]\s*\)\s*\.select\(\s*(["'`]\s*\*\s*["'`])?\s*\)/.test(src)) fail(file, 'selects * from jams (column grants hide full_address; list the columns)');
}

if (failures.length) {
  console.error(`Repo rule check failed:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`Repo rules OK (${migrations.length} migrations, functions dir clean, no select * from jams).`);
