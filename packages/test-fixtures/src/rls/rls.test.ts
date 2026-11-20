import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { buildScenario } from "../scenario";
import { anonClient, serviceClient, signedInClient } from "./localSupabase";

const { scenario, refs } = buildScenario();
const { host, member, newcomer } = refs.members;
const { officialNext, privateUpcoming, communityUpcoming } = refs.jams;

let asHost: SupabaseClient;
let asMember: SupabaseClient;
let asNewcomer: SupabaseClient;
let asService: SupabaseClient;

beforeAll(async () => {
  [asHost, asMember, asNewcomer] = await Promise.all(
    [host, member, newcomer].map((m) => signedInClient(m.auth.email)),
  );
  asService = serviceClient();
});

async function jamName(id: string) {
  const { data, error } = await asService.from("jams").select("name").eq("id", id).single();
  if (error) throw error;
  return data.name;
}

describe("jams: only the host can change a jam", () => {
  it("lets the host update their own jam", async () => {
    const { data, error } = await asHost.from("jams").update({ name: officialNext.name }).eq("id", officialNext.id).select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("ignores an update from a member who isn't the host", async () => {
    const { data, error } = await asMember.from("jams").update({ name: "Hijacked" }).eq("id", officialNext.id).select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await jamName(officialNext.id)).toBe(officialNext.name);
  });

  it("ignores a delete from a member who isn't the host", async () => {
    const { data, error } = await asMember.from("jams").delete().eq("id", officialNext.id).select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await jamName(officialNext.id)).toBe(officialNext.name);
  });
});

describe("jam_invites: an invitee sees only their own invite", () => {
  const privateInvites = scenario.jamInvites.filter((i) => i.jam_id === privateUpcoming.id);

  it("shows the member just their invite, not the other guests'", async () => {
    const { data, error } = await asMember.from("jam_invites").select("id, invited_user_id");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((row) => row.invited_user_id === member.profile.id)).toBe(true);
    expect(privateInvites.length).toBeGreaterThan(1);
  });

  it("shows the host every invite on their jam", async () => {
    const { data, error } = await asHost.from("jam_invites").select("id").eq("jam_id", privateUpcoming.id);
    expect(error).toBeNull();
    expect(data!.map((r) => r.id).sort()).toEqual(privateInvites.map((i) => i.id).sort());
  });
});

describe("jams: a private jam is hidden from strangers", () => {
  const visible = async (client: SupabaseClient, id: string) => {
    const { data, error } = await client.from("jams").select("id").eq("id", id);
    expect(error).toBeNull();
    return data!.length === 1;
  };

  it("hides it from a signed-in member with no invite", async () => {
    expect(await visible(asNewcomer, privateUpcoming.id)).toBe(false);
    expect(await visible(asNewcomer, communityUpcoming.id)).toBe(true);
  });

  it("hides it from signed-out visitors", async () => {
    expect(await visible(anonClient(), privateUpcoming.id)).toBe(false);
  });

  it("shows it to the host and to an invited member", async () => {
    expect(await visible(asHost, privateUpcoming.id)).toBe(true);
    expect(await visible(asMember, privateUpcoming.id)).toBe(true);
  });
});
