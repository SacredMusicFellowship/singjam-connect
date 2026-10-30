import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSend, mockCreateNotification, mockJoinJamSetList } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue({}),
  mockCreateNotification: vi.fn(),
  mockJoinJamSetList: vi.fn(),
}));

vi.mock("@/lib/resend", () => ({ resend: { emails: { send: mockSend } }, FROM_ADDRESS: "test@singjam.org" }));
vi.mock("@/emails/jam-rsvp-confirmed", () => ({ jamRsvpConfirmedHtml: vi.fn(() => "<html>") }));
vi.mock("@/lib/notifications", () => ({ createNotification: mockCreateNotification }));
vi.mock("@/lib/jamAttendance", () => ({ joinJamSetList: mockJoinJamSetList }));

import { rsvpToJam, type RsvpJam } from "./jamRsvp";

const JAM: RsvpJam = {
  id: "jam-1",
  name: "Leaders jam",
  capacity: null,
  host_user_id: "host-1",
  visibility: "community",
  starts_at: "2026-10-01T02:00:00Z",
  ends_at: null,
  timezone: "America/Los_Angeles",
  full_address: null,
  neighborhood: "Oakland",
};
const USER_ID = "user-1";

// Each table answers from its own queue, in the order the helper asks.
function fakeAdmin(results: Record<string, any[]>) {
  const chains: Record<string, any[]> = {};
  const from = vi.fn((table: string) => {
    const result = results[table]?.shift() ?? { data: null };
    const c: any = {};
    for (const m of ["select", "eq", "neq", "update", "insert"]) c[m] = vi.fn().mockReturnValue(c);
    c.maybeSingle = vi.fn().mockResolvedValue(result);
    c.single = vi.fn().mockResolvedValue(result);
    c.then = (resolve: any) => Promise.resolve(result).then(resolve);
    (chains[table] ??= []).push(c);
    return c;
  });
  const admin: any = {
    from,
    auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: "me@example.com" } } }) } },
  };
  return { admin, chains };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rsvpToJam", () => {
  it("seats a new RSVP, emails a confirmation and tells the host", async () => {
    const { admin, chains } = fakeAdmin({
      jam_rsvps: [{ data: null }, { count: 0 }, { data: [{ id: "r1" }] }],
      profiles: [{ data: { display_name: "Scott" } }],
    });

    const result = await rsvpToJam(admin, JAM, USER_ID);

    expect(result).toEqual({ status: "attending", waitlistPosition: null });
    expect(chains.jam_rsvps[2].insert).toHaveBeenCalledWith(
      expect.objectContaining({ jam_id: "jam-1", user_id: USER_ID, status: "attending" })
    );
    expect(mockJoinJamSetList).toHaveBeenCalledWith(admin, "jam-1", USER_ID);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: "me@example.com" }));
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "host-1", type: "jam_rsvp", title: "Scott is going to Leaders jam" })
    );
  });

  it("announces nothing when the person is already going", async () => {
    // Accept & RSVP followed by the RSVP button: the second call must be silent.
    const { admin, chains } = fakeAdmin({
      jam_rsvps: [{ data: { id: "r1", status: "attending", waitlist_position: null } }],
    });

    const result = await rsvpToJam(admin, JAM, USER_ID);

    expect(result).toEqual({ status: "attending", waitlistPosition: null });
    expect(chains.jam_rsvps).toHaveLength(1);
    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockJoinJamSetList).toHaveBeenCalled();
  });

  it("keeps a waitlisted person's place instead of queueing them again", async () => {
    const { admin, chains } = fakeAdmin({
      jam_rsvps: [{ data: { id: "r1", status: "waitlist", waitlist_position: 2 } }],
    });

    const result = await rsvpToJam(admin, JAM, USER_ID);

    expect(result).toEqual({ status: "waitlist", waitlistPosition: 2 });
    expect(chains.jam_rsvps).toHaveLength(1);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("waitlists at capacity, tells the host so, and sends no confirmation", async () => {
    const { admin, chains } = fakeAdmin({
      jam_rsvps: [{ data: null }, { count: 1 }, { count: 2 }, { data: [{ id: "r1" }] }],
      profiles: [{ data: { display_name: "Nina" } }],
    });

    const result = await rsvpToJam(admin, { ...JAM, capacity: 1 }, USER_ID);

    expect(result).toEqual({ status: "waitlist", waitlistPosition: 3 });
    expect(chains.jam_rsvps[3].insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "waitlist", waitlist_position: 3 })
    );
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockJoinJamSetList).not.toHaveBeenCalled();
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Nina is on the waitlist for Leaders jam" })
    );
  });

  it("counts the host's own seat toward capacity", async () => {
    // Capacity 9 with 7 other people going is 8 in the room: one seat left, not two.
    const { admin, chains } = fakeAdmin({
      jam_rsvps: [{ data: null }, { count: 8 }, { count: 0 }, { data: [{ id: "r1" }] }],
      profiles: [{ data: { display_name: "Nina" } }],
    });

    const result = await rsvpToJam(admin, { ...JAM, capacity: 9 }, USER_ID);

    expect(chains.jam_rsvps[1].neq).toHaveBeenCalledWith("user_id", "host-1");
    expect(result).toEqual({ status: "waitlist", waitlistPosition: 1 });
  });

  it("counts an official event's creator as an ordinary attendee", async () => {
    // No host seat is added on official events, so leaving the creator's RSVP
    // out of the count would make every official headcount one short.
    const { admin, chains } = fakeAdmin({
      jam_rsvps: [{ data: null }, { count: 7 }, { data: [{ id: "r1" }] }],
      profiles: [{ data: { display_name: "Nina" } }],
    });

    await rsvpToJam(admin, { ...JAM, visibility: "official", capacity: 9 }, USER_ID);

    expect(chains.jam_rsvps[1].neq).not.toHaveBeenCalled();
  });

  it("seats the last open spot once the host is counted", async () => {
    const { admin } = fakeAdmin({
      jam_rsvps: [{ data: null }, { count: 7 }, { data: [{ id: "r1" }] }],
      profiles: [{ data: { display_name: "Nina" } }],
    });

    const result = await rsvpToJam(admin, { ...JAM, capacity: 9 }, USER_ID);

    expect(result).toEqual({ status: "attending", waitlistPosition: null });
  });

  it("brings back a cancelled RSVP only if it is still cancelled", async () => {
    const { admin, chains } = fakeAdmin({
      jam_rsvps: [{ data: { id: "r1", status: "cancelled", waitlist_position: null } }, { count: 0 }, { data: [{ id: "r1" }] }],
      profiles: [{ data: { display_name: "Scott" } }],
    });

    await rsvpToJam(admin, JAM, USER_ID);

    const write = chains.jam_rsvps[2];
    expect(write.update).toHaveBeenCalledWith({ status: "attending", waitlist_position: null });
    expect(write.eq).toHaveBeenCalledWith("status", "cancelled");
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
  });

  it("stays silent when an overlapping request wrote the RSVP first", async () => {
    const { admin } = fakeAdmin({
      jam_rsvps: [
        { data: null },
        { count: 0 },
        { data: null, error: { code: "23505" } }, // unique (jam_id, user_id)
        { data: { id: "r1", status: "attending", waitlist_position: null } },
      ],
    });

    const result = await rsvpToJam(admin, JAM, USER_ID);

    expect(result).toEqual({ status: "attending", waitlistPosition: null });
    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("throws rather than report a seat when the write didn't land", async () => {
    const { admin } = fakeAdmin({
      jam_rsvps: [{ data: null }, { count: 0 }, { data: null, error: { message: "boom" } }, { data: null }],
    });

    await expect(rsvpToJam(admin, JAM, USER_ID)).rejects.toThrow();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("doesn't notify a host about their own RSVP", async () => {
    const { admin } = fakeAdmin({
      jam_rsvps: [{ data: null }, { count: 0 }, { data: [{ id: "r1" }] }],
      profiles: [{ data: { display_name: "Host" } }],
    });

    await rsvpToJam(admin, { ...JAM, host_user_id: USER_ID }, USER_ID);

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});
