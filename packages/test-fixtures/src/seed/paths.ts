import path from "node:path";

const repoRoot = path.resolve(__dirname, "../../../..");

export const MIGRATIONS_DIR = path.join(repoRoot, "supabase/migrations");
export const SEED_DIR = path.join(repoRoot, "supabase/seed/e2e");
