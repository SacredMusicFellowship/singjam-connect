import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { E2E_PASSWORD } from "@singjam/test-fixtures";
import { localSupabaseKeys } from "@singjam/test-fixtures/local-supabase";

const keys = localSupabaseKeys();

// Service-role client for arranging and checking data around a test. Local stack only.
export const admin = createClient(keys.url, keys.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type FreshMember = { id: string; email: string; username: string; firstName: string };

// A throwaway member with a finished profile, so tests that change data never collide with each
// other or with the seeded personas, whichever browser or worker runs them.
export async function createFreshMember(): Promise<FreshMember> {
  const tag = randomUUID().slice(0, 8);
  const email = `e2e-${tag}@singjam.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: E2E_PASSWORD, email_confirm: true });
  if (error) throw error;
  const member = { id: data.user.id, email, username: `e2e_${tag}`, firstName: "Testy" };
  const { error: profileError } = await admin
    .from("profiles")
    .update({ username: member.username, display_name: member.firstName, last_name: `Fixture${tag}`, neighborhood: "Harbor Point" })
    .eq("id", member.id);
  if (profileError) throw profileError;
  return member;
}

export async function deleteMember(id: string): Promise<void> {
  await admin.auth.admin.deleteUser(id);
}

// An upcoming community jam hosted by `hostId`, for tests that need a jam of their own.
export async function createJam(hostId: string, name: string): Promise<{ id: string }> {
  const startsAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const { data, error } = await admin
    .from("jams")
    .insert({
      name,
      host_user_id: hostId,
      visibility: "community",
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(startsAt + 2 * 60 * 60 * 1000).toISOString(),
      timezone: "America/Los_Angeles",
      neighborhood: "Harbor Point",
      full_address: "1 Fixture Lane, Harbor Point, CA 90002",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

// An upcoming official event with its own paid and free tiers, so ticket tests never sell out
// the seeded events. Deleting it removes its orders and tickets too.
export async function createTicketedEvent(hostId: string, name: string) {
  const startsAt = Date.now() + 14 * 24 * 60 * 60 * 1000;
  const { data: jam, error } = await admin
    .from("jams")
    .insert({
      name,
      host_user_id: hostId,
      visibility: "official",
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(startsAt + 3 * 60 * 60 * 1000).toISOString(),
      timezone: "America/Los_Angeles",
      neighborhood: "Lantern Hill",
      full_address: "41 Lantern Lane, Lantern Hill, CA 90001",
      capacity: 50,
      ticket_limit: 20,
    })
    .select("id")
    .single();
  if (error) throw error;
  const { error: tierError } = await admin.from("ticket_types").insert([
    { jam_id: jam.id, name: "General admission", description: "Lyrics and chords provided", price_cents: 1500, quantity: null, sort_order: 0 },
    { jam_id: jam.id, name: "Under 12", description: "Kids sing free", price_cents: 0, quantity: 10, sort_order: 1 },
  ]);
  if (tierError) throw tierError;
  return { id: jam.id as string, name };
}
