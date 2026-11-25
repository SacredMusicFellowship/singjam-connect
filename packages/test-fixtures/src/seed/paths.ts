import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

export const MIGRATIONS_DIR = path.join(repoRoot, "supabase/migrations");
export const SEED_DIR = path.join(repoRoot, "supabase/seed/e2e");
