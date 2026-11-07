import fs from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { E2E_PASSWORD } from "../constants";
import { buildScenario } from "../scenario";
import { MIGRATIONS_DIR, SEED_DIR } from "./paths";
import { createMigratedDatabase } from "./pglite";
import { scenarioToSql } from "./scenarioToSql";

const { scenario, refs } = buildScenario();
const files = scenarioToSql(scenario);

describe("committed seed files", () => {
  it("match the generator (run npm run seed:write -w @singjam/test-fixtures)", () => {
    const committed = fs.readdirSync(SEED_DIR).filter((f) => f.endsWith(".sql")).sort();
    expect(committed).toEqual(files.map((f) => f.name));
    for (const file of files) expect(fs.readFileSync(path.join(SEED_DIR, file.name), "utf8")).toBe(file.sql);
  });
});

describe("seed against the migrated schema", () => {
  let db: PGlite;
  let standIns: string[];

  beforeAll(async () => {
    ({ db, standIns } = await createMigratedDatabase(MIGRATIONS_DIR));
    for (const file of files) await db.exec(file.sql);
  }, 180_000);

  afterAll(() => db?.close());

  const count = async (table: string) => (await db.query<{ n: number }>(`select count(*)::int n from ${table}`)).rows[0].n;

  it("loads every row", async () => {
    const expected: [string, number][] = [
      ["auth.users", scenario.authUsers.length],
      ["auth.identities", scenario.authUsers.length],
      ["public.profiles", scenario.profiles.length],
      ["public.songs", scenario.songs.length],
      ["public.song_composers", scenario.songComposers.length],
      ["public.song_genres", scenario.songGenres.length],
      ["public.user_songs", scenario.userSongs.length],
      ["public.jams", scenario.jams.length],
      ["public.jam_genres", scenario.jamGenres.length],
      ["public.jam_rsvps", scenario.jamRsvps.length],
      ["public.jam_invites", scenario.jamInvites.length],
      ["public.sets", scenario.sets.length],
      ["public.set_songs", scenario.setSongs.length],
      ["public.set_collaborators", scenario.setCollaborators.length],
      ["public.ticket_types", scenario.ticketTypes.length],
      ["public.ticket_orders", scenario.ticketOrders.length],
      ["public.tickets", scenario.tickets.length],
      ["public.event_attendance", scenario.eventAttendance.length],
      ["public.notifications", scenario.notifications.length],
    ];
    for (const [table, n] of expected) expect([table, await count(table)]).toEqual([table, n]);
  });

  it("resolves every genre by name", async () => {
    const { rows } = await db.query<{ n: number }>("select count(*)::int n from public.song_genres where genre_id is null");
    expect(rows[0].n).toBe(0);
  });

  it("fills in the profiles created by the signup trigger", async () => {
    const { rows } = await db.query<{ username: string; can_host_official: boolean }>(
      "select username, can_host_official from public.profiles where id = $1",
      [refs.members.host.profile.id],
    );
    expect(rows[0]).toEqual({ username: refs.members.host.profile.username, can_host_official: true });
  });

  it("anchors times to now(), keeping upcoming jams upcoming", async () => {
    const { rows } = await db.query<{ upcoming: boolean }>("select starts_at > now() upcoming from public.jams where id = $1", [refs.jams.officialNext.id]);
    expect(rows[0].upcoming).toBe(true);
  });

  it("stores passwords hashed, and they verify", async () => {
    const { rows } = await db.query<{ ok: boolean; hashed: boolean }>(
      "select encrypted_password = extensions.crypt($1, encrypted_password) ok, encrypted_password <> $1 hashed from auth.users where id = $2",
      [E2E_PASSWORD, refs.members.member.auth.id],
    );
    expect(rows[0]).toEqual({ ok: true, hashed: true });
  });

  it("only needs stand-ins for the policies production created outside the migrations", () => {
    expect(standIns.every((s) => /^(jams|jam_invites|user_songs): /.test(s))).toBe(true);
  });
});
