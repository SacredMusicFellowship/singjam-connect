import { execFileSync } from "node:child_process";

export type LocalSupabaseKeys = { url: string; anonKey: string; serviceRoleKey: string };

// The running local stack's URL and keys, from `supabase status` unless the environment already
// provides them (as CI does). Refuses anything that isn't on this machine, so tests and the e2e
// server can never be pointed at a hosted project.
export function localSupabaseKeys(): LocalSupabaseKeys {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  const keys =
    SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY
      ? { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY }
      : fromStatus();
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(keys.url)) {
    throw new Error(`Tests only run against a local Supabase, not ${keys.url}`);
  }
  return keys;
}

function fromStatus(): LocalSupabaseKeys {
  let output: string;
  try {
    output = execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    throw new Error("Local Supabase isn't running. Start Docker, then run `supabase start` from the repo root.");
  }
  const status = JSON.parse(output);
  return { url: status.API_URL, anonKey: status.ANON_KEY, serviceRoleKey: status.SERVICE_ROLE_KEY };
}
