import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { E2E_PASSWORD } from "../constants";
import { localSupabaseKeys } from "../supabase/local";

const keys = localSupabaseKeys();
const options = { auth: { persistSession: false, autoRefreshToken: false } };

export const anonClient = (): SupabaseClient => createClient(keys.url, keys.anonKey, options);

export const serviceClient = (): SupabaseClient => createClient(keys.url, keys.serviceRoleKey, options);

export async function signedInClient(email: string): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password: E2E_PASSWORD });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}
