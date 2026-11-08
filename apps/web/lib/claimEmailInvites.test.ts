import { describe, it, expect, vi } from "vitest";
import { claimEmailInvites, claimJamEmailInvites, claimSetEmailInvites } from "./claimEmailInvites";

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
  // `_` is a single-character wildcard to ilike; unescaped, a_b@x.com would claim axb@x.com's invite.
  it("looks up jam and set invites with ilike wildcards escaped", async () => {
    const a = admin({ data: [] }, { data: [] });
    await claimEmailInvites(a as any, USER, " a_b%c@x.com ");
    expect(a.from).toHaveBeenCalledWith("jam_invites");
    expect(a.from).toHaveBeenCalledWith("set_collaborators");
    for (const c of a.chains()) expect(c.ilike).toHaveBeenCalledWith("invitee_email", "a\\_b\\%c@x.com");
  });
});

describe("claimJamEmailInvites", () => {
  it("does nothing when no email invite matches", async () => {
    const a = admin({ data: [] });
    await claimJamEmailInvites(a as any, USER, "joel@example.com");
    expect(a.from).toHaveBeenCalledTimes(1);
  });

  it("binds a matching invite to the new account", async () => {
    const a = admin(
      { data: [{ id: "inv-1", jam_id: "jam-1" }] },
      { data: [] }, // invites already held
      { data: [] }, // jams hosted
      { error: null },
    );
    await claimJamEmailInvites(a as any, USER, "Joel@Example.com");
    const [lookup, , , update] = a.chains();
    expect(lookup.ilike).toHaveBeenCalledWith("invitee_email", "Joel@Example.com");
    expect(update.update).toHaveBeenCalledWith({ invited_user_id: USER, invitee_email: null });
    expect(update.in).toHaveBeenCalledWith("id", ["inv-1"]);
  });

  it("drops the email row when the user already holds an invite to that jam", async () => {
    const a = admin(
      { data: [{ id: "inv-email", jam_id: "jam-1" }] },
      { data: [{ id: "inv-member", jam_id: "jam-1" }] },
      { data: [] },
      { error: null },
    );
    await claimJamEmailInvites(a as any, USER, "joel@example.com");
    const del = a.chains()[3];
    expect(del.delete).toHaveBeenCalled();
    expect(del.in).toHaveBeenCalledWith("id", ["inv-email"]);
    expect(a.from).toHaveBeenCalledTimes(4);
  });

  // Binding both rows to one user would trip the (jam_id, invited_user_id) index and fail the update.
  it("claims one row per jam when the address was invited twice", async () => {
    const a = admin(
      { data: [{ id: "inv-a", jam_id: "jam-1" }, { id: "inv-b", jam_id: "jam-1" }] },
      { data: [] },
      { data: [] },
      { error: null }, // delete extra
      { error: null }, // update
    );
    await claimJamEmailInvites(a as any, USER, "joel@example.com");
    const [, , , del, update] = a.chains();
    expect(del.in).toHaveBeenCalledWith("id", ["inv-b"]);
    expect(update.in).toHaveBeenCalledWith("id", ["inv-a"]);
  });

  it("does not invite a host to their own jam", async () => {
    const a = admin(
      { data: [{ id: "inv-1", jam_id: "jam-1" }] },
      { data: [] },
      { data: [{ id: "jam-1" }] },
    );
    await claimJamEmailInvites(a as any, USER, "host@example.com");
    expect(a.from).toHaveBeenCalledTimes(3);
  });
});

describe("claimSetEmailInvites", () => {
  it("does nothing when no set invite matches", async () => {
    const a = admin({ data: [] });
    await claimSetEmailInvites(a as any, USER, "joel@example.com");
    expect(a.from).toHaveBeenCalledTimes(1);
    expect(a.chains()[0].eq).toHaveBeenCalledWith("status", "pending");
  });

  // Signing up without the emailed link used to leave them with no access at all.
  it("grants access with the invite's role by accepting the row", async () => {
    const a = admin(
      { data: [{ id: "col-1", set_id: "set-1" }] },
      { data: [] }, // already a collaborator
      { data: [] }, // sets owned
      { error: null },
    );
    await claimSetEmailInvites(a as any, USER, "joel@example.com");
    const update = a.chains()[3];
    expect(update.update).toHaveBeenCalledWith({ user_id: USER, status: "accepted", invitee_email: null });
    expect(update.in).toHaveBeenCalledWith("id", ["col-1"]);
    expect(update.is).toHaveBeenCalledWith("user_id", null);
  });

  it("retires the invite when they already collaborate on the set", async () => {
    const a = admin(
      { data: [{ id: "col-1", set_id: "set-1" }] },
      { data: [{ set_id: "set-1" }] },
      { data: [] },
      { error: null },
    );
    await claimSetEmailInvites(a as any, USER, "joel@example.com");
    const del = a.chains()[3];
    expect(del.delete).toHaveBeenCalled();
    expect(del.in).toHaveBeenCalledWith("id", ["col-1"]);
    expect(a.from).toHaveBeenCalledTimes(4);
  });

  it("never makes the owner a collaborator on their own set", async () => {
    const a = admin(
      { data: [{ id: "col-1", set_id: "set-1" }] },
      { data: [] },
      { data: [{ id: "set-1" }] },
      { error: null },
    );
    await claimSetEmailInvites(a as any, USER, "owner@example.com");
    expect(a.chains()[3].delete).toHaveBeenCalled();
    expect(a.from).toHaveBeenCalledTimes(4);
  });

  it("accepts one row per set when the address was invited twice", async () => {
    const a = admin(
      { data: [{ id: "col-a", set_id: "set-1" }, { id: "col-b", set_id: "set-1" }] },
      { data: [] },
      { data: [] },
      { error: null },
      { error: null },
    );
    await claimSetEmailInvites(a as any, USER, "joel@example.com");
    const [, , , del, update] = a.chains();
    expect(del.in).toHaveBeenCalledWith("id", ["col-b"]);
    expect(update.in).toHaveBeenCalledWith("id", ["col-a"]);
  });
});
