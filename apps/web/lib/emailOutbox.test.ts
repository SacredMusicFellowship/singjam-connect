import { describe, it, expect, vi } from "vitest";

vi.mock("@/emails/welcome", () => ({
  welcomeEmailHtml: ({ name }: { name?: string } = {}) => `<html>welcome:${name ?? ""}</html>`,
  finishSetupEmailHtml: () => "<html>finish-setup</html>",
}));

import { enqueueWelcomeEmail, flushEmailOutbox, sweepPendingWelcomes } from "./emailOutbox";

// Minimal chainable Supabase mock. A fresh builder per from() call resolves to
// `upsertResult` when .upsert() was used, `selectResult` otherwise, and records
// every .update() payload so we can assert status transitions.
function makeAdmin({
  upsertResult = { data: [], error: null } as any,
  selectResult = { data: [], error: null } as any,
  rpcResult = { data: [], error: null } as any,
} = {}) {
  const updates: any[] = [];
  const upsertPayloads: any[] = [];
  const rpc = vi.fn(async () => rpcResult);
  const from = vi.fn(() => {
    let usedUpsert = false;
    let updatePayload: any = null;
    const obj: any = {};
    const pass = (fn?: (...a: any[]) => void) => vi.fn((...args: any[]) => { fn?.(...args); return obj; });
    obj.upsert = pass((payload: any) => { usedUpsert = true; upsertPayloads.push(payload); });
    obj.select = pass();
    obj.eq = pass();
    obj.lt = pass();
    obj.order = pass();
    obj.limit = pass();
    obj.update = vi.fn((payload: any) => { updatePayload = payload; updates.push(payload); return obj; });
    obj.then = (resolve: any) =>
      resolve(updatePayload !== null ? { data: null, error: null } : usedUpsert ? upsertResult : selectResult);
    return obj;
  });
  return { admin: { from, rpc } as any, updates, upsertPayloads, rpc };
}

const okResend = () => ({ emails: { send: vi.fn().mockResolvedValue({ error: null }) } }) as any;
const errResend = (message = "boom") => ({ emails: { send: vi.fn().mockResolvedValue({ error: { message } }) } }) as any;

const row = (over: Partial<any> = {}) => ({
  id: "e1", type: "welcome", recipient: "a@b.com", payload: { name: "Ben", variant: "welcome" }, attempts: 0, ...over,
});

describe("enqueueWelcomeEmail", () => {
  it("inserts, sends immediately, and marks the row sent", async () => {
    const { admin, updates } = makeAdmin({ upsertResult: { data: [row()], error: null } });
    const resend = okResend();
    await enqueueWelcomeEmail(admin, resend, { userId: "u1", email: "a@b.com", name: "Ben" });
    expect(resend.emails.send).toHaveBeenCalledOnce();
    expect(updates.at(-1)).toMatchObject({ status: "sent", attempts: 1 });
  });

  it("greets with the name the user chose at setup", async () => {
    const { admin } = makeAdmin({ upsertResult: { data: [row({ payload: { name: "Ben", variant: "welcome" } })], error: null } });
    const resend = okResend();
    await enqueueWelcomeEmail(admin, resend, { userId: "u1", email: "a@b.com", name: "Ben" });
    expect(resend.emails.send.mock.calls[0][0]).toMatchObject({
      subject: "Welcome to SingJam",
      html: "<html>welcome:Ben</html>",
    });
  });

  it("is a no-op when the row already exists (unique conflict → empty insert)", async () => {
    const { admin, updates } = makeAdmin({ upsertResult: { data: [], error: null } });
    const resend = okResend();
    await enqueueWelcomeEmail(admin, resend, { userId: "u1", email: "a@b.com" });
    expect(resend.emails.send).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("leaves the row untouched when the dev-safety guard blocks the send", async () => {
    const { admin, updates } = makeAdmin({ upsertResult: { data: [row()], error: null } });
    const blocked = { emails: { send: vi.fn().mockResolvedValue({ error: { name: "dev_side_effects_blocked", message: "blocked" } }) } } as any;
    await enqueueWelcomeEmail(admin, blocked, { userId: "u1", email: "a@b.com" });
    expect(updates).toHaveLength(0);
  });

  it("leaves the row pending with the error recorded when the send fails", async () => {
    const { admin, updates } = makeAdmin({ upsertResult: { data: [row()], error: null } });
    await enqueueWelcomeEmail(admin, errResend("smtp down"), { userId: "u1", email: "a@b.com" });
    expect(updates.at(-1)).toMatchObject({ status: "pending", attempts: 1, last_error: "smtp down" });
  });
});

describe("flushEmailOutbox", () => {
  it("sends every pending row and reports counts", async () => {
    const { admin } = makeAdmin({
      selectResult: { data: [row({ id: "e1" }), row({ id: "e2", attempts: 2 })], error: null },
    });
    const resend = okResend();
    const res = await flushEmailOutbox(admin, resend);
    expect(res).toEqual({ sent: 2, failed: 0 });
    expect(resend.emails.send).toHaveBeenCalledTimes(2);
  });

  it("marks a row failed once it hits the attempt cap", async () => {
    const { admin, updates } = makeAdmin({ selectResult: { data: [row({ attempts: 4 })], error: null } });
    const res = await flushEmailOutbox(admin, errResend());
    expect(res).toEqual({ sent: 0, failed: 1 });
    expect(updates.at(-1)).toMatchObject({ status: "failed", attempts: 5 });
  });

  it("renders the finish-setup nudge for rows enqueued by the sweep", async () => {
    const { admin } = makeAdmin({
      selectResult: { data: [row({ payload: { name: null, variant: "finish_setup" } })], error: null },
    });
    const resend = okResend();
    await flushEmailOutbox(admin, resend);
    expect(resend.emails.send.mock.calls[0][0]).toMatchObject({
      subject: "Finish setting up your SingJam profile",
      html: "<html>finish-setup</html>",
    });
  });
});

describe("sweepPendingWelcomes", () => {
  it("nudges signups that never picked a name", async () => {
    const { admin, upsertPayloads, rpc } = makeAdmin({
      rpcResult: { data: [{ user_id: "u1", email: "a@b.com", name: null }], error: null },
      upsertResult: { data: [row({ payload: { name: null, variant: "finish_setup" } })], error: null },
    });
    const resend = okResend();
    expect(await sweepPendingWelcomes(admin, resend)).toBe(1);
    expect(rpc).toHaveBeenCalledWith("signups_awaiting_welcome");
    expect(upsertPayloads[0]).toMatchObject({
      user_id: "u1",
      type: "welcome",
      recipient: "a@b.com",
      payload: { variant: "finish_setup" },
    });
  });

  it("welcomes properly when setup finished but the save-time send never landed", async () => {
    const { admin, upsertPayloads } = makeAdmin({
      rpcResult: { data: [{ user_id: "u1", email: "a@b.com", name: "Ben" }], error: null },
      upsertResult: { data: [row()], error: null },
    });
    const resend = okResend();
    await sweepPendingWelcomes(admin, resend);
    expect(upsertPayloads[0]).toMatchObject({ payload: { name: "Ben", variant: "welcome" } });
    expect(resend.emails.send).toHaveBeenCalledOnce();
  });

  it("uses the welcome type for both variants, so nobody can receive two", async () => {
    const { admin, upsertPayloads } = makeAdmin({
      rpcResult: { data: [{ user_id: "u1", email: "a@b.com", name: null }], error: null },
      upsertResult: { data: [], error: null }, // unique (user_id, type) conflict
    });
    const resend = okResend();
    await sweepPendingWelcomes(admin, resend);
    expect(upsertPayloads[0].type).toBe("welcome");
    expect(resend.emails.send).not.toHaveBeenCalled();
  });

  it("returns zero and sends nothing when the RPC errors", async () => {
    const { admin } = makeAdmin({ rpcResult: { data: null, error: { message: "nope" } } });
    const resend = okResend();
    expect(await sweepPendingWelcomes(admin, resend)).toBe(0);
    expect(resend.emails.send).not.toHaveBeenCalled();
  });
});
