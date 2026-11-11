import { describe, it, expect } from "vitest";
import { prioritizePeople, shownPeopleCount } from "./peopleOverflow";

const people = ["ana", "ben", "cy", "dee", "eve"].map((user_id) => ({ user_id }));
const ids = (list: { user_id: string }[]) => list.map((p) => p.user_id);

describe("prioritizePeople", () => {
  it("puts chosen leaders, then the viewer, at the front", () => {
    expect(ids(prioritizePeople(people, ["dee", "eve", "cy"]))).toEqual(["dee", "eve", "cy", "ana", "ben"]);
  });

  it("keeps everyone else in their original order", () => {
    expect(ids(prioritizePeople(people, ["cy"]))).toEqual(["cy", "ana", "ben", "dee", "eve"]);
  });

  it("ignores ids that aren't in the row, nulls and repeats", () => {
    expect(ids(prioritizePeople(people, ["zed", null, undefined, "ben", "ben"]))).toEqual(["ben", "ana", "cy", "dee", "eve"]);
  });

  it("doesn't change the list it was given", () => {
    const copy = [...people];
    prioritizePeople(people, ["eve"]);
    expect(people).toEqual(copy);
  });
});

describe("shownPeopleCount", () => {
  it("shows everyone when they fit", () => {
    expect(shownPeopleCount(3, 3)).toBe(3);
    expect(shownPeopleCount(1, 3)).toBe(1);
  });

  it("leaves the last slot for '+ N more' when they don't", () => {
    expect(shownPeopleCount(4, 3)).toBe(2);
    expect(shownPeopleCount(20, 6)).toBe(5);
  });
});
