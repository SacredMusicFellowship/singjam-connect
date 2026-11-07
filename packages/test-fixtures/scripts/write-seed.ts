// Writes supabase/seed/e2e/*.sql from the fixtures. Run with: npm run seed:write -w @singjam/test-fixtures
import fs from "node:fs";
import path from "node:path";
import { buildScenario } from "../src/scenario";
import { SEED_DIR } from "../src/seed/paths";
import { scenarioToSql } from "../src/seed/scenarioToSql";

const files = scenarioToSql(buildScenario().scenario);

fs.mkdirSync(SEED_DIR, { recursive: true });
for (const stale of fs.readdirSync(SEED_DIR).filter((f) => f.endsWith(".sql"))) {
  if (!files.some((f) => f.name === stale)) fs.rmSync(path.join(SEED_DIR, stale));
}
for (const file of files) fs.writeFileSync(path.join(SEED_DIR, file.name), file.sql);

console.log(`Wrote ${files.length} seed files to ${path.relative(process.cwd(), SEED_DIR)}`);
