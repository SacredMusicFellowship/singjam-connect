import { describe, it, expect } from "vitest";
import { jamIsFull, jamSeatsTaken } from "./jamCapacity";

const privateJam = { capacity: 9, host_user_id: "host", visibility: "private" };
const official = { capacity: 9, host_user_id: "creator", visibility: "official" };

describe("jamSeatsTaken", () => {
  it("counts the host as one of the people going", () => {
    expect(jamSeatsTaken(privateJam, 7)).toBe(8);
    expect(jamSeatsTaken({ ...privateJam, visibility: "community" }, 0)).toBe(1);
  });

  it("takes no host seat on an official event", () => {
    expect(jamSeatsTaken(official, 7)).toBe(7);
  });

  it("takes no host seat when there is no host", () => {
    expect(jamSeatsTaken({ ...privateJam, host_user_id: null }, 3)).toBe(3);
  });
});

describe("jamIsFull", () => {
  it("is full once the host plus RSVPs reach capacity", () => {
    expect(jamIsFull(privateJam, 7)).toBe(false);
    expect(jamIsFull(privateJam, 8)).toBe(true);
  });

  it("lets an official event fill to capacity with RSVPs alone", () => {
    expect(jamIsFull(official, 8)).toBe(false);
    expect(jamIsFull(official, 9)).toBe(true);
  });

  it("is never full without a capacity", () => {
    expect(jamIsFull({ ...privateJam, capacity: null }, 500)).toBe(false);
  });
});
