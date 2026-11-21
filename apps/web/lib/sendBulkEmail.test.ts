import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSend, mockBatch } = vi.hoisted(() => ({ mockSend: vi.fn(), mockBatch: vi.fn() }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: mockSend }, batch: { send: mockBatch } } }));

import { sendBulkEmail } from "./sendBulkEmail";

const email = (i: number, withAttachment = false) => ({
  from: "a@x.com",
  to: `r${i}@x.com`,
  subject: "s",
  html: "h",
  ...(withAttachment ? { attachments: [{ filename: "e.ics", content: "x" }] } : {}),
});
const rateLimited = { data: null, error: { name: "rate_limit_exceeded", message: "Too many requests" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("sendBulkEmail", () => {
  it("sends plain mail through the batch endpoint, 100 per request", async () => {
    mockBatch.mockResolvedValue({ data: { data: [] }, error: null });
    const result = await sendBulkEmail(Array.from({ length: 150 }, (_, i) => email(i)));

    expect(mockBatch).toHaveBeenCalledTimes(2);
    expect(mockBatch.mock.calls[0][0]).toHaveLength(100);
    expect(mockBatch.mock.calls[1][0]).toHaveLength(50);
    expect(mockSend).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 150, failed: 0 });
  });

  it("reports a failed batch as failed instead of sent", async () => {
    mockBatch.mockResolvedValue({ data: null, error: { name: "application_error", message: "boom" } });
    expect(await sendBulkEmail([email(1), email(2)])).toEqual({ sent: 0, failed: 2 });
  });

  it("retries once after a rate limit", async () => {
    mockBatch.mockResolvedValueOnce(rateLimited).mockResolvedValueOnce({ data: { data: [] }, error: null });
    expect(await sendBulkEmail([email(1)])).toEqual({ sent: 1, failed: 0 });
    expect(mockBatch).toHaveBeenCalledTimes(2);
  });

  it("paces mail with attachments, at most 8 requests per second", async () => {
    vi.useFakeTimers();
    mockSend.mockResolvedValue({ data: { id: "x" }, error: null });
    const done = sendBulkEmail(Array.from({ length: 12 }, (_, i) => email(i, true)));

    await vi.advanceTimersByTimeAsync(0);
    expect(mockSend).toHaveBeenCalledTimes(8);
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockSend).toHaveBeenCalledTimes(12);
    expect(await done).toEqual({ sent: 12, failed: 0 });
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it("counts individual failures on the paced path", async () => {
    mockSend
      .mockResolvedValueOnce({ data: { id: "x" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { name: "validation_error", message: "bad" } })
      .mockRejectedValueOnce(new Error("network"));
    expect(await sendBulkEmail([email(1, true), email(2, true), email(3, true)])).toEqual({ sent: 1, failed: 2 });
  });
});
