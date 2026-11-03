import { describe, it, expect, vi, beforeEach } from "vitest";

const { fetchContactsWithTag, tagFirstTimeAttendee } = vi.hoisted(() => ({
  fetchContactsWithTag: vi.fn(),
  tagFirstTimeAttendee: vi.fn(),
}));
vi.mock("@/lib/activecampaign", () => ({ fetchContactsWithTag, tagFirstTimeAttendee }));

import { runEventAttendanceSweep, PRE_CHECKIN_EVENT_TAGS } from "./eventAttendance";

function fakeAdmin({ firstTimers = [] as { id: string; email: string }[] } = {}) {
  const upserts: { rows: any[]; opts: any }[] = [];
  const updates: { values: any; id: string }[] = [];
  const rpc = vi.fn(async (name: string) => {
    if (name === "record_event_attendance") return { data: 3, error: null };
    if (name === "event_first_timers_to_tag") return { data: firstTimers, error: null };
    throw new Error(`unexpected rpc ${name}`);
  });
  const admin = {
    rpc,
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: [{ id: "user-1", email: "Member@Example.com" }] }, error: null }),
      },
    },
    from: () => ({
      upsert: (rows: any[], opts: any) => {
        upserts.push({ rows, opts });
        return { select: async () => ({ data: rows.map((_, i) => ({ id: `r${i}` })), error: null }) };
      },
      update: (values: any) => ({
        eq: async (_col: string, id: string) => {
          updates.push({ values, id });
          return { error: null };
        },
      }),
    }),
  };
  return { admin: admin as any, rpc, upserts, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchContactsWithTag.mockResolvedValue([]);
  tagFirstTimeAttendee.mockResolvedValue(true);
});

describe("runEventAttendanceSweep", () => {
  it("imports the older AC event tags, lowercasing emails and linking members", async () => {
    fetchContactsWithTag.mockImplementation(async (tagId: string) =>
      tagId === "33"
        ? [
            { email: "MEMBER@example.com", firstName: "Ada", lastName: "L" },
            { email: "guest@example.com", firstName: "", lastName: "" },
          ]
        : []
    );
    const { admin, upserts } = fakeAdmin();

    const result = await runEventAttendanceSweep(admin);

    expect(fetchContactsWithTag).toHaveBeenCalledTimes(PRE_CHECKIN_EVENT_TAGS.length);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].opts).toEqual({ onConflict: "jam_id,email", ignoreDuplicates: true });
    expect(upserts[0].rows).toEqual([
      expect.objectContaining({ email: "member@example.com", user_id: "user-1", name: "Ada L", source: "ac_import" }),
      expect.objectContaining({ email: "guest@example.com", user_id: null, name: null, source: "ac_import" }),
    ]);
    expect(result.imported).toBe(2);
    expect(result.recorded).toBe(3);
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
    expect(result).toMatchObject({ tagged: 1, failed: 1, importFailed: false });
  });

  it("records check-ins but tags no one when an older AC tag can't be read", async () => {
    fetchContactsWithTag.mockResolvedValueOnce(null);
    const { admin, rpc } = fakeAdmin({ firstTimers: [{ id: "a1", email: "regular@example.com" }] });

    const result = await runEventAttendanceSweep(admin);

    expect(rpc).toHaveBeenCalledWith("record_event_attendance");
    expect(rpc).not.toHaveBeenCalledWith("event_first_timers_to_tag");
    expect(tagFirstTimeAttendee).not.toHaveBeenCalled();
    expect(result).toMatchObject({ importFailed: true, recorded: 3, tagged: 0 });
  });
});
