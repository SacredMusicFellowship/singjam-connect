import { describe, it, expect, vi } from "vitest";
import { claimGuestTickets } from "./ticketClaim";

// Mirrors the shapes PostgREST returns for the chained calls the helper makes.
function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "eq", "is", "ilike", "update", "insert", "in"]) {
    c[m] = vi.fn().mockReturnValue(c);
  }
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  c.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return c;
}

function adminWith(queue: any[]) {
  const from = vi.fn();
  for (const r of queue) from.mockReturnValueOnce(chain(r));
  return { from } as any;
}

describe("claimGuestTickets", () => {
  it("claims a paid guest order and turns it into attendance", async () => {
    const admin = adminWith([
      { data: [{ id: "order-1", jam_id: "jam-1" }] }, // unclaimed guest orders
      { error: null },                                 // orders -> buyer_user_id
      { error: null },                                 // tickets -> holder_user_id
      { error: null },                                 // jam_leaders -> user_id
      { data: null },                                  // existing rsvp
      { error: null },                                 // rsvp insert
      { data: null },                                  // linked set — none
    ]);

    const jams = await claimGuestTickets(admin, "user-9", "Guest@Example.com");

    expect(jams).toEqual(["jam-1"]);
    expect(admin.from.mock.results[1].value.update).toHaveBeenCalledWith({ buyer_user_id: "user-9" });
    expect(admin.from.mock.results[2].value.update).toHaveBeenCalledWith({ holder_user_id: "user-9" });
    expect(admin.from.mock.results[3].value.update).toHaveBeenCalledWith({ user_id: "user-9", email: null, name: null });
    expect(admin.from.mock.results[5].value.insert).toHaveBeenCalledWith(
      expect.objectContaining({ jam_id: "jam-1", user_id: "user-9", status: "attending" })
    );
  });

  it("matches the email case-insensitively", async () => {
    const admin = adminWith([{ data: [] }]);
    await claimGuestTickets(admin, "user-9", "Guest@Example.com");
    expect(admin.from.mock.results[0].value.ilike).toHaveBeenCalledWith("buyer_email", "Guest@Example.com");
  });

  it("does nothing when there is no unclaimed guest order", async () => {
    const admin = adminWith([{ data: [] }]);
    const jams = await claimGuestTickets(admin, "user-9", "nobody@example.com");
    expect(jams).toEqual([]);
    // Only the lookup ran — no writes followed.
    expect(admin.from).toHaveBeenCalledTimes(1);
  });

  it("only ever claims paid orders that no account owns", async () => {
    const admin = adminWith([{ data: [] }]);
    await claimGuestTickets(admin, "user-9", "guest@example.com");
    const lookup = admin.from.mock.results[0].value;
    expect(lookup.is).toHaveBeenCalledWith("buyer_user_id", null);
    expect(lookup.eq).toHaveBeenCalledWith("status", "paid");
  });

  it("deduplicates jams when one email bought several orders for the same event", async () => {
    const admin = adminWith([
      { data: [{ id: "o1", jam_id: "jam-1" }, { id: "o2", jam_id: "jam-1" }] },
      { error: null },
      { error: null },
      { error: null },
      { data: null },
      { error: null },
      { data: null },
    ]);
    const jams = await claimGuestTickets(admin, "user-9", "guest@example.com");
    expect(jams).toEqual(["jam-1"]);
  });
});
