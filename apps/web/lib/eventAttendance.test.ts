import { describe, it, expect, vi, beforeEach } from "vitest";

const { tagFirstTimeAttendee } = vi.hoisted(() => ({ tagFirstTimeAttendee: vi.fn() }));
vi.mock("@/lib/activecampaign", () => ({ tagFirstTimeAttendee }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn() } }, FROM_ADDRESS: "SingJam <hello@singjam.org>" }));

import { runEventAttendanceSweep } from "./eventAttendance";

function fakeAdmin({ firstTimers = [] as { id: string; email: string }[] } = {}) {
  const updates: { values: any; id: string }[] = [];
  const rpc = vi.fn(async (name: string) => {
    if (name === "record_event_attendance") return { data: 3, error: null };
    if (name === "event_first_timers_to_tag") return { data: firstTimers, error: null };
    throw new Error(`unexpected rpc ${name}`);
  });
  const admin = {
    rpc,
    from: () => ({
      update: (values: any) => ({
        eq: async (_col: string, id: string) => {
          updates.push({ values, id });
          return { error: null };
        },
      }),
    }),
  };
  return { admin: admin as any, rpc, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  tagFirstTimeAttendee.mockResolvedValue(true);
});

describe("runEventAttendanceSweep", () => {
  it("records attendance before working out who the first-timers are", async () => {
    const { admin, rpc } = fakeAdmin();

    const result = await runEventAttendanceSweep(admin);

    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["record_event_attendance", "event_first_timers_to_tag"]);
    expect(result).toEqual({ recorded: 3, tagged: 0, failed: 0, deferred: 0 });
  });

  it("tags each first-timer and marks only the ones AC accepted", async () => {
    tagFirstTimeAttendee.mockImplementation(async (email: string) => email !== "flaky@example.com");
    const { admin, updates } = fakeAdmin({
      firstTimers: [
        { id: "a1", email: "new@example.com" },
        { id: "a2", email: "flaky@example.com" },
      ],
    });

    const result = await runEventAttendanceSweep(admin);

    expect(updates.map((u) => u.id)).toEqual(["a1"]);
    expect(updates[0].values.first_timer_tagged_at).toEqual(expect.any(String));
    expect(result).toMatchObject({ tagged: 1, failed: 1, deferred: 0 });
  });

  it("stops tagging once the time budget is spent and reports what's left", async () => {
    const now = vi.spyOn(Date, "now");
    let clock = 0;
    now.mockImplementation(() => clock);
    tagFirstTimeAttendee.mockImplementation(async () => {
      clock += 6_000;
      return true;
    });
    const { admin, updates } = fakeAdmin({
      firstTimers: [
        { id: "a1", email: "one@example.com" },
        { id: "a2", email: "two@example.com" },
        { id: "a3", email: "three@example.com" },
      ],
    });

    const result = await runEventAttendanceSweep(admin, { budgetMs: 10_000 });

    expect(updates.map((u) => u.id)).toEqual(["a1", "a2"]);
    expect(result).toMatchObject({ tagged: 2, deferred: 1 });
    now.mockRestore();
  });
});
