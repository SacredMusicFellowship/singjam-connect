import { describe, it, expect } from "vitest";
import { canEditJam } from "./jamEditRights";

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
