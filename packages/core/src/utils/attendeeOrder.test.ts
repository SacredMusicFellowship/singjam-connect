import { describe, it, expect } from "vitest";
import { attendeeRole, sortAttendees } from "./attendeeOrder";

type P = { name: string; host?: boolean; cohost?: boolean; leader?: boolean };
const order = (people: P[]) =>
  sortAttendees(people, (p) => ({ role: attendeeRole(p), name: p.name })).map((p) => p.name);

describe("attendeeRole", () => {
  it("puts a co-host who also leads with the co-hosts", () => {
    expect(attendeeRole({ cohost: true, leader: true })).toBe("cohost");
    expect(attendeeRole({ leader: true })).toBe("leader");
    expect(attendeeRole({})).toBe("going");
  });
});

describe("sortAttendees", () => {
  it("lists host, co-hosts, leaders, then everyone else, each by name", () => {
    expect(
      order([
        { name: "Zed" },
        { name: "yara", leader: true },
        { name: "Bea", leader: true },
        { name: "Mo", cohost: true, leader: true },
        { name: "amy" },
        { name: "Hal", host: true },
        { name: "Cy", cohost: true },
      ])
    ).toEqual(["Hal", "Cy", "Mo", "Bea", "yara", "amy", "Zed"]);
  });

  it("ignores case and accents and keeps equal names in their original order", () => {
    const people = [{ name: "Élise", id: 1 }, { name: "elise", id: 2 }, { name: "Dan", id: 3 }];
    expect(sortAttendees(people, (p) => ({ role: "going", name: p.name })).map((p) => p.id)).toEqual([3, 1, 2]);
  });
});
