import { createClient } from "@supabase/supabase-js";
import { E2E_PASSWORD } from "@singjam/test-fixtures";
import { localSupabaseKeys } from "@singjam/test-fixtures/local-supabase";
import { expect, test } from "./fixtures";
import { admin, createFreshMember, createJam, deleteMember } from "./support/supabase";

// The native app has no cookie session: it calls the web API with the member's Supabase access
// token. `request` carries no browser cookies, so these calls are signed in only by that token.
async function accessToken(email: string): Promise<string> {
  const keys = localSupabaseKeys();
  const client = createClient(keys.url, keys.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: E2E_PASSWORD });
  if (error) throw error;
  return data.session.access_token;
}

test("a host signed in on the app links a set list to their jam and unlinks it", async ({ request }) => {
  const host = await createFreshMember();
  try {
    const jam = await createJam(host.id, `App Set List Jam ${host.username}`);
    const { data: set, error } = await admin
      .from("sets")
      .insert({ name: `App Set List ${host.username}`, owner_user_id: host.id })
      .select("id")
      .single();
    if (error || !set) throw error;
    const headers = { Authorization: `Bearer ${await accessToken(host.email)}` };

    expect((await request.put(`/api/jam/${jam.id}/set`, { data: { setId: set.id } })).status()).toBe(401);

    const link = await request.put(`/api/jam/${jam.id}/set`, { headers, data: { setId: set.id } });
    expect(link.status()).toBe(200);
    const { data: linked } = await admin.from("sets").select("jam_id").eq("id", set.id).single();
    expect(linked?.jam_id).toBe(jam.id);

    const read = await request.get(`/api/jam/${jam.id}/set`, { headers });
    expect((await read.json()).set?.id).toBe(set.id);

    const unlink = await request.delete(`/api/jam/${jam.id}/set`, { headers });
    expect(unlink.status()).toBe(200);
    const { data: unlinked } = await admin.from("sets").select("jam_id").eq("id", set.id).single();
    expect(unlinked?.jam_id).toBeNull();
  } finally {
    await deleteMember(host.id);
  }
});
