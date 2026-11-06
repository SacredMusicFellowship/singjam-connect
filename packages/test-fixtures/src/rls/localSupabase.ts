import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { E2E_PASSWORD } from "../constants";

type Keys = { url: string; anonKey: string; serviceRoleKey: string };

// Reads the running local stack's URL and keys from `supabase status`, unless the environment
// already provides them (as CI does). Never points at a hosted project.
function localKeys(): Keys {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY) {
    return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY };
  }
  const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8" }));
  return { url: status.API_URL, anonKey: status.ANON_KEY, serviceRoleKey: status.SERVICE_ROLE_KEY };
}

const keys = localKeys();
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(keys.url)) {
  throw new Error(`RLS tests only run against a local Supabase, not ${keys.url}`);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };

export const anonClient = (): SupabaseClient => createClient(keys.url, keys.anonKey, options);

export const serviceClient = (): SupabaseClient => createClient(keys.url, keys.serviceRoleKey, options);

export async function signedInClient(email: string): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password: E2E_PASSWORD });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}
