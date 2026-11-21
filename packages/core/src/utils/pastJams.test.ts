import { describe, expect, it } from "vitest";
import { pastJamsOrFilter, pastJamsWindowStart } from "./pastJams";

describe("pastJamsOrFilter", () => {
  it("shows a guest only official events", () => {
    expect(pastJamsOrFilter(null, [{ jam_id: "a" }], [])).toBe("visibility.eq.official");
  });

  it("adds hosted jams for a signed-in user with no RSVPs or invites", () => {
    expect(pastJamsOrFilter("u1", [], [])).toBe("visibility.eq.official,host_user_id.eq.u1");
  });

  it("includes RSVP'd jams and answered invites, not pending ones, without duplicates", () => {
    expect(
      pastJamsOrFilter(
        "u1",
        [{ jam_id: "a" }, { jam_id: "b" }],
        [
          { jam_id: "b", status: "accepted" },
          { jam_id: "c", status: "declined" },
          { jam_id: "d", status: "pending" },
        ],
      ),
    ).toBe("visibility.eq.official,host_user_id.eq.u1,id.in.(a,b,c)");
  });
});

describe("pastJamsWindowStart", () => {
  it("is 90 days before now", () => {
    expect(pastJamsWindowStart(new Date("2026-11-05T00:00:00Z"))).toBe("2026-08-07T00:00:00.000Z");
  });
});
