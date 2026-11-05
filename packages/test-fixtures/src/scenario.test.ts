import { describe, expect, it } from "vitest";
import { MUSICAL_KEYS } from "@singjam/core";
import { EMAIL_DOMAIN, FIXED_NOW } from "./constants";
import { GENRES } from "./names";
import { buildScenario } from "./scenario";

const { scenario, refs } = buildScenario();

function uniqueBy<T>(rows: T[], key: (row: T) => string) {
  const keys = rows.map(key);
  return new Set(keys).size === keys.length;
}

describe("buildScenario determinism", () => {
  it("builds the same world for the same seed", () => {
    expect(buildScenario()).toEqual(buildScenario());
  });

  it("builds a different world with different ids for another seed", () => {
    const other = buildScenario({ seed: 99 }).scenario;
    expect(other.profiles[0].id).not.toBe(scenario.profiles[0].id);
  });
});

describe("referential integrity", () => {
  const userIds = new Set(scenario.profiles.map((p) => p.id));
  const songIds = new Set(scenario.songs.map((s) => s.id));
  const jamIds = new Set(scenario.jams.map((j) => j.id));
  const setIds = new Set(scenario.sets.map((s) => s.id));
  const orderIds = new Set(scenario.ticketOrders.map((o) => o.id));
  const typeIds = new Set(scenario.ticketTypes.map((t) => t.id));

  it("gives every profile an auth user with the same id", () => {
    expect(scenario.authUsers.map((u) => u.id)).toEqual(scenario.profiles.map((p) => p.id));
  });

  it("points every foreign key at a row in the scenario", () => {
    for (const r of scenario.userSongs) expect(userIds.has(r.user_id) && songIds.has(r.song_id)).toBe(true);
    for (const j of scenario.jams) expect(userIds.has(j.host_user_id)).toBe(true);
    for (const r of scenario.jamRsvps) expect(jamIds.has(r.jam_id) && userIds.has(r.user_id)).toBe(true);
    for (const r of scenario.jamInvites) expect(jamIds.has(r.jam_id) && userIds.has(r.invited_user_id)).toBe(true);
    for (const r of scenario.jamCohosts) expect(jamIds.has(r.jam_id) && userIds.has(r.user_id)).toBe(true);
    for (const s of scenario.sets) {
      expect(userIds.has(s.owner_user_id)).toBe(true);
      if (s.jam_id) expect(jamIds.has(s.jam_id)).toBe(true);
    }
    for (const r of scenario.setSongs) {
      expect(setIds.has(r.set_id) && songIds.has(r.song_id)).toBe(true);
      for (const leader of r.leader_user_ids) expect(userIds.has(leader)).toBe(true);
    }
    for (const r of scenario.setCollaborators) expect(setIds.has(r.set_id) && userIds.has(r.user_id)).toBe(true);
    for (const o of scenario.ticketOrders) {
      expect(jamIds.has(o.jam_id)).toBe(true);
      if (o.buyer_user_id) expect(userIds.has(o.buyer_user_id)).toBe(true);
    }
    for (const t of scenario.tickets) expect(orderIds.has(t.order_id) && typeIds.has(t.ticket_type_id)).toBe(true);
    for (const n of scenario.notifications) expect(userIds.has(n.user_id)).toBe(true);
  });
});

describe("database constraints", () => {
  it("only uses values the check constraints allow", () => {
    for (const j of scenario.jams) expect(["private", "community", "official"]).toContain(j.visibility);
    for (const r of scenario.jamRsvps) expect(["attending", "waitlist", "cancelled"]).toContain(r.status);
    for (const r of scenario.userSongs) expect(["lead", "support", "learn"]).toContain(r.confidence);
    for (const s of scenario.sets) expect(["private", "link", "public"]).toContain(s.link_sharing);
    for (const c of scenario.setCollaborators) {
      expect(["editor", "viewer", "co-owner"]).toContain(c.role);
      expect(["pending", "accepted", "requested"]).toContain(c.status);
    }
    for (const o of scenario.ticketOrders) {
      expect(["pending", "paid", "failed", "expired", "refunded", "cancelled"]).toContain(o.status);
      expect(o.amount_cents).toBeGreaterThanOrEqual(0);
    }
    for (const a of scenario.eventAttendance) expect(a.email).toBe(a.email.toLowerCase());
    for (const s of scenario.setSongs) if (s.notes) expect(s.notes.length).toBeLessThanOrEqual(200);
  });

  it("satisfies the unique indexes", () => {
    expect(uniqueBy(scenario.profiles.filter((p) => p.username), (p) => p.username!.toLowerCase())).toBe(true);
    expect(uniqueBy(scenario.songs, (s) => s.slug)).toBe(true);
    expect(uniqueBy(scenario.songs, (s) => `${s.title.toLowerCase()}|${s.display_artist.toLowerCase()}`)).toBe(true);
    expect(uniqueBy(scenario.jams, (j) => j.short_code)).toBe(true);
    expect(uniqueBy(scenario.sets, (s) => s.short_code)).toBe(true);
    expect(uniqueBy(scenario.sets.filter((s) => s.jam_id), (s) => s.jam_id!)).toBe(true);
    expect(uniqueBy(scenario.userSongs, (r) => `${r.user_id}|${r.song_id}`)).toBe(true);
    expect(uniqueBy(scenario.jamRsvps, (r) => `${r.jam_id}|${r.user_id}`)).toBe(true);
    expect(uniqueBy(scenario.setSongs, (r) => `${r.set_id}|${r.song_id}`)).toBe(true);
    expect(uniqueBy(scenario.eventAttendance, (r) => `${r.jam_id}|${r.email}`)).toBe(true);
    expect(uniqueBy(scenario.ticketOrders, (o) => o.stripe_checkout_session_id)).toBe(true);
    expect(uniqueBy(scenario.authUsers, (u) => u.email)).toBe(true);
  });

  it("uses genres and keys the app knows", () => {
    for (const g of scenario.songGenres) expect(GENRES).toContain(g.genre_name);
    for (const s of scenario.songs) expect(MUSICAL_KEYS).toContain(s.tonality);
    for (const r of scenario.setSongs) if (r.key_note) expect(MUSICAL_KEYS).toContain(r.key_note);
  });
});

describe("fake data only", () => {
  it("uses the reserved .test domain for every email", () => {
    const emails = [
      ...scenario.authUsers.map((u) => u.email),
      ...scenario.ticketOrders.map((o) => o.buyer_email),
      ...scenario.eventAttendance.map((a) => a.email),
    ];
    for (const email of emails) expect(email.endsWith(`@${EMAIL_DOMAIN}`)).toBe(true);
  });

  it("has no photos, recordings or chord charts", () => {
    for (const p of scenario.profiles) expect(p.avatar_url).toBeNull();
    for (const s of scenario.songs) expect([s.youtube_url, s.chord_chart_url]).toEqual([null, null]);
    for (const j of scenario.jams) expect(j.image_url).toBeNull();
  });

  it("marks every Stripe id as a fixture", () => {
    for (const o of scenario.ticketOrders) {
      expect(o.stripe_checkout_session_id).toMatch(/^cs_test_fixture_/);
      if (o.stripe_payment_intent_id) expect(o.stripe_payment_intent_id).toMatch(/^pi_test_fixture_/);
    }
  });
});

describe("what the e2e suite relies on", () => {
  const upcoming = (iso: string) => new Date(iso) > FIXED_NOW;

  it("has upcoming and past official events, with ticket types and paid orders", () => {
    const { officialNext, officialLater, officialPast } = refs.jams;
    expect([officialNext, officialLater, officialPast].every((j) => j.visibility === "official")).toBe(true);
    expect(upcoming(officialNext.starts_at) && upcoming(officialLater.starts_at)).toBe(true);
    expect(upcoming(officialPast.starts_at)).toBe(false);
    expect(scenario.ticketTypes.filter((t) => t.jam_id === officialNext.id)).toHaveLength(2);
    expect(scenario.ticketOrders.some((o) => o.jam_id === officialNext.id && o.status === "paid" && o.buyer_user_id === null)).toBe(true);
    expect(scenario.eventAttendance.length).toBeGreaterThan(0);
  });

  it("hosts official events only from members allowed to", () => {
    const allowed = new Set(scenario.profiles.filter((p) => p.can_host_official || p.role === "admin").map((p) => p.id));
    for (const j of scenario.jams.filter((j) => j.visibility === "official")) expect(allowed.has(j.host_user_id)).toBe(true);
  });

  it("puts RSVPs past capacity on the waitlist", () => {
    const full = scenario.jamRsvps.filter((r) => r.jam_id === refs.jams.communityFull.id);
    expect(full.filter((r) => r.status === "attending")).toHaveLength(refs.jams.communityFull.capacity!);
    expect(full.filter((r) => r.status === "waitlist").map((r) => r.waitlist_position)).toEqual([1, 2]);
  });

  it("gives the member friend matches and leaves the newcomer's repertoire empty", () => {
    const songsOf = (id: string) => new Set(scenario.userSongs.filter((r) => r.user_id === id).map((r) => r.song_id));
    const mine = songsOf(refs.members.member.profile.id);
    const shared = (id: string) => [...songsOf(id)].filter((s) => mine.has(s)).length;
    expect(shared(refs.members.host.profile.id)).toBeGreaterThanOrEqual(8);
    expect(songsOf(refs.members.newcomer.profile.id).size).toBe(0);
  });

  it("leaves the unfinished account without a username, like a fresh signup", () => {
    expect(refs.members.unfinished.profile.username).toBeNull();
  });
});
