import { describe, it, expect } from "vitest";
import { canEditJam, canManageJamAs } from "./jamEditRights";

const official = { host_user_id: "creator", visibility: "official" };
const community = { host_user_id: "creator", visibility: "community" };

describe("canEditJam", () => {
  it("lets the host edit their own jam", () => {
    expect(canEditJam(community, { id: "creator" })).toBe(true);
  });

  it("lets an official host edit an official event someone else created", () => {
    expect(canEditJam(official, { id: "u1", can_host_official: true })).toBe(true);
  });

  it("does not let an official host edit somebody's community or private jam", () => {
    expect(canEditJam(community, { id: "u1", can_host_official: true })).toBe(false);
    expect(canEditJam({ ...community, visibility: "private" }, { id: "u1", can_host_official: true })).toBe(false);
  });

  it("refuses a member without the capability on an official event", () => {
    expect(canEditJam(official, { id: "u1", can_host_official: false })).toBe(false);
    expect(canEditJam(official, { id: "u1" })).toBe(false);
  });

  it("refuses a signed-out visitor", () => {
    expect(canEditJam(official, null)).toBe(false);
  });
});

describe('canManageJamAs', () => {
  const community = { host_user_id: 'host', visibility: 'community' };
  const official = { host_user_id: 'creator', visibility: 'official' };

  it('lets the host and co-hosts run a community jam', () => {
    expect(canManageJamAs(community, { id: 'host' }, false)).toBe(true);
    expect(canManageJamAs(community, { id: 'cohost' }, true)).toBe(true);
  });

  it("doesn't let anyone else run a community jam, even an official-event admin", () => {
    expect(canManageJamAs(community, { id: 'member' }, false)).toBe(false);
    expect(canManageJamAs(community, { id: 'admin', can_host_official: true }, false)).toBe(false);
  });

  it('lets any official-event admin run an official event', () => {
    expect(canManageJamAs(official, { id: 'admin', can_host_official: true }, false)).toBe(true);
    expect(canManageJamAs(official, { id: 'member' }, false)).toBe(false);
  });

  it('lets nobody run a jam when signed out', () => {
    expect(canManageJamAs(community, null, true)).toBe(false);
  });
});
