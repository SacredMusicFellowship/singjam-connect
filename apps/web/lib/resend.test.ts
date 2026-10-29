import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockSend, mockBatchSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue({}),
  mockBatchSend: vi.fn().mockResolvedValue({}),
}));

vi.mock("resend", () => ({
  // A class, not an arrow: lib/resend.ts calls `new Resend(...)`.
  Resend: class {
    emails = { send: mockSend };
    batch = { send: mockBatchSend };
  },
}));

import { resend, REPLY_TO, FROM_ADDRESS } from "./resend";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("resend client", () => {
  it("sends from SingJam", () => {
    expect(FROM_ADDRESS).toBe("SingJam <hello@singjam.org>");
  });

  it("puts the events inbox on every single send", async () => {
    await resend.emails.send({ from: FROM_ADDRESS, to: "a@b.com", subject: "s", html: "<p/>" } as any);
    expect(mockSend.mock.calls[0][0]).toMatchObject({ replyTo: REPLY_TO });
  });

  it("puts it on every message in a batch", async () => {
    await resend.batch.send([
      { from: FROM_ADDRESS, to: "a@b.com", subject: "1", html: "<p/>" },
      { from: FROM_ADDRESS, to: "c@d.com", subject: "2", html: "<p/>" },
    ] as any);
    for (const m of mockBatchSend.mock.calls[0][0]) {
      expect(m).toMatchObject({ replyTo: REPLY_TO });
    }
  });

  it("lets a caller override it", async () => {
    await resend.emails.send({ from: FROM_ADDRESS, to: "a@b.com", subject: "s", html: "<p/>", replyTo: "someone@else.org" } as any);
    expect(mockSend.mock.calls[0][0].replyTo).toBe("someone@else.org");
  });

  it("does not reach Resend under next dev, and reports the send as failed", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const single = await resend.emails.send({ from: FROM_ADDRESS, to: "a@b.com", subject: "s", html: "<p/>" } as any);
    const batch = await resend.batch.send([{ from: FROM_ADDRESS, to: "a@b.com", subject: "1", html: "<p/>" }] as any);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockBatchSend).not.toHaveBeenCalled();
    expect(single.error?.name).toBe("dev_side_effects_blocked");
    expect(batch.error?.name).toBe("dev_side_effects_blocked");
  });

  it("sends under next dev when ALLOW_DEV_SIDE_EFFECTS=true", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_DEV_SIDE_EFFECTS", "true");
    await resend.emails.send({ from: FROM_ADDRESS, to: "a@b.com", subject: "s", html: "<p/>" } as any);
    expect(mockSend).toHaveBeenCalledOnce();
  });
});
