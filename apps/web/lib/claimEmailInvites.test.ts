import { describe, it, expect, vi } from "vitest";
import { claimEmailInvites } from "./claimEmailInvites";

function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "eq", "in", "is", "ilike", "update", "delete"]) c[m] = vi.fn().mockReturnValue(c);
  c.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return c;
}

function admin(...results: any[]) {
  const from = vi.fn();
  for (const r of results) from.mockReturnValueOnce(chain(r));
  return { from, chains: () => from.mock.results.map((r: any) => r.value) };
}

const USER = "user-1";

describe("claimEmailInvites", () => {
  it("does nothing when no email invite matches", async () => {
    const a = admin({ data: [] });
    await claimEmailInvites(a as any, USER, "joel@example.com");
    expect(a.from).toHaveBeenCalledTimes(1);
  });

  it("binds a matching invite to the new account", async () => {
    const a = admin(
      { data: [{ id: "inv-1", jam_id: "jam-1" }] },
      { data: [] }, // invites already held
      { data: [] }, // jams hosted
      { error: null },
    );
    await claimEmailInvites(a as any, USER, "Joel@Example.com");
    const [lookup, , , update] = a.chains();
    expect(lookup.ilike).toHaveBeenCalledWith("invitee_email", "Joel@Example.com");
    expect(update.update).toHaveBeenCalledWith({ invited_user_id: USER, invitee_email: null });
    expect(update.in).toHaveBeenCalledWith("id", ["inv-1"]);
  });

  // `_` is a single-character wildcard to ilike; unescaped, a_b@x.com would claim axb@x.com's invite.
  it("escapes ilike wildcards in the address", async () => {
    const a = admin({ data: [] });
    await claimEmailInvites(a as any, USER, "a_b%c@x.com");
    expect(a.chains()[0].ilike).toHaveBeenCalledWith("invitee_email", "a\\_b\\%c@x.com");
  });

  it("drops the email row when the user already holds an invite to that jam", async () => {
    const a = admin(
      { data: [{ id: "inv-email", jam_id: "jam-1" }] },
      { data: [{ id: "inv-member", jam_id: "jam-1" }] },
      { data: [] },
      { error: null },
    );
    await claimEmailInvites(a as any, USER, "joel@example.com");
    const del = a.chains()[3];
    expect(del.delete).toHaveBeenCalled();
    expect(del.in).toHaveBeenCalledWith("id", ["inv-email"]);
    expect(a.from).toHaveBeenCalledTimes(4);
  });

  it("does not invite a host to their own jam", async () => {
    const a = admin(
      { data: [{ id: "inv-1", jam_id: "jam-1" }] },
      { data: [] },
      { data: [{ id: "jam-1" }] },
    );
    await claimEmailInvites(a as any, USER, "host@example.com");
    expect(a.from).toHaveBeenCalledTimes(3);
  });
});
