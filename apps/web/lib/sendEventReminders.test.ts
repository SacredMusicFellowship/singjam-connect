import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGuests } = vi.hoisted(() => ({ mockGuests: vi.fn() }));
vi.mock("./jamGuestBuyers", () => ({ guestTicketBuyers: mockGuests }));

import { reminderDue, sendEventReminders } from "./sendEventReminders";

// Sunday 1 Nov 2026, 2:30 PM in Berkeley (PST, UTC-8).
const EVENT = {
  id: "jam-1",
  name: "SingJam at the Starry Plough",
  starts_at: "2026-11-01T22:30:00Z",
  timezone: "America/Los_Angeles",
  full_address: "The Starry Plough Pub, 3101 Shattuck Ave., Berkeley, CA 94705, USA",
  neighborhood: "Berkeley, CA",
  host_user_id: "host-1",
};

// Friday 30 Oct 2026, 8 AM PDT (UTC-7).
const FRIDAY_8AM = new Date("2026-10-30T15:00:00Z");

function makeAdmin({ jams = [EVENT], claimError = null as any, rsvps = [] as any[], savedMessage = null as string | null } = {}) {
  const insert = vi.fn().mockResolvedValue({ error: claimError });
  const deleteEq2 = vi.fn().mockResolvedValue({ error: null });
  const del = vi.fn(() => ({ eq: () => ({ eq: deleteEq2 }) }));
  const jamsChain: any = {};
  for (const m of ["select", "eq", "gte"]) jamsChain[m] = vi.fn(() => jamsChain);
  jamsChain.lte = vi.fn().mockResolvedValue({ data: jams, error: null });

  const admin = {
    from: vi.fn((table: string) => {
      if (table === "jams") return jamsChain;
      if (table === "jam_reminders_sent") return { insert, delete: del };
      if (table === "jam_rsvps") return { select: () => ({ eq: () => ({ eq: async () => ({ data: rsvps }) }) }) };
      if (table === "app_settings")
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: savedMessage ? { value: savedMessage } : null }) }) }) };
      if (table === "sets")
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "set-1" } }) }) }) };
      if (table === "profiles")
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { display_name: "Host" } }) }) }) };
      throw new Error(`unexpected table ${table}`);
    }),
    auth: {
      admin: {
        getUserById: vi.fn(async (id: string) => ({ data: { user: { email: `${id}@example.com` } } })),
      },
    },
  };
  return { admin: admin as any, insert, del, jamsChain };
}

const makeResend = (error: any = null) => ({
  batch: {
    send: vi.fn(async (payloads: any[]) =>
      error ? { data: null, error } : { data: { data: payloads.map(() => ({ id: "x" })) }, error: null }
    ),
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGuests.mockResolvedValue(new Map([["guest@example.com", "Gina"]]));
});

describe("reminderDue — 48h", () => {
  it("is due from 8 AM local two days before", () => {
    expect(reminderDue("48h", FRIDAY_8AM, EVENT)).toBe(true);
  });

  it("is not due before 8 AM local", () => {
    expect(reminderDue("48h", new Date("2026-10-30T14:00:00Z"), EVENT)).toBe(false); // 7 AM PDT
  });

  it("catches up later the same day", () => {
    expect(reminderDue("48h", new Date("2026-10-31T03:00:00Z"), EVENT)).toBe(true); // 8 PM PDT Friday
  });

  it("is not due the day before or three days before", () => {
    expect(reminderDue("48h", new Date("2026-10-31T16:00:00Z"), EVENT)).toBe(false); // Saturday
    expect(reminderDue("48h", new Date("2026-10-29T16:00:00Z"), EVENT)).toBe(false); // Thursday
  });

  it("uses the event's timezone, not UTC", () => {
    // 11 PM Thursday in Berkeley is already Friday in UTC.
    expect(reminderDue("48h", new Date("2026-10-30T06:00:00Z"), EVENT)).toBe(false);
  });
});

describe("reminderDue — 5h", () => {
  it("is due from five hours before the start", () => {
    expect(reminderDue("5h", new Date("2026-11-01T17:30:00Z"), EVENT)).toBe(true); // 9:30 AM PST
    expect(reminderDue("5h", new Date("2026-11-01T18:00:00Z"), EVENT)).toBe(true); // 10 AM PST
  });

  it("is not due earlier on the day", () => {
    expect(reminderDue("5h", new Date("2026-11-01T17:00:00Z"), EVENT)).toBe(false); // 9 AM PST
  });

  it("is not due once the event has started", () => {
    expect(reminderDue("5h", new Date("2026-11-01T22:30:00Z"), EVENT)).toBe(false);
  });
});

describe("sendEventReminders", () => {
  it("sends the day-of reminder on the morning of the event", async () => {
    const { admin, insert } = makeAdmin();
    const resend = makeResend();
    await sendEventReminders(admin, resend as any, new Date("2026-11-01T18:00:00Z"));
    expect(insert).toHaveBeenCalledWith({ jam_id: "jam-1", reminder_type: "5h" });
    expect(insert).not.toHaveBeenCalledWith({ jam_id: "jam-1", reminder_type: "48h" });
    expect(resend.batch.send.mock.calls[0][0][0].subject).toBe("Today: SingJam at the Starry Plough");
  });

  it("only looks at official events", async () => {
    const { admin, jamsChain } = makeAdmin({ jams: [] });
    await sendEventReminders(admin, makeResend() as any, FRIDAY_8AM);
    expect(jamsChain.eq).toHaveBeenCalledWith("visibility", "official");
  });

  it("emails members and guest ticket buyers once each", async () => {
    const { admin, insert } = makeAdmin({ rsvps: [{ user_id: "member-1" }] });
    mockGuests.mockResolvedValue(new Map([["guest@example.com", "Gina"], ["member-1@example.com", "Dup"]]));
    const resend = makeResend();

    const sent = await sendEventReminders(admin, resend as any, FRIDAY_8AM);

    expect(insert).toHaveBeenCalledWith({ jam_id: "jam-1", reminder_type: "48h" });
    const to = resend.batch.send.mock.calls.flatMap((c: any) => c[0]).map((p: any) => p.to);
    expect(to.sort()).toEqual(["guest@example.com", "host-1@example.com", "member-1@example.com"]);
    expect(sent).toBe(3);
  });

  it("uses Sherri's wording, personalised, with the song menu linked", async () => {
    const { admin } = makeAdmin();
    const resend = makeResend();
    await sendEventReminders(admin, resend as any, FRIDAY_8AM);
    const guestEmail = resend.batch.send.mock.calls[0][0].find((p: any) => p.to === "guest@example.com");
    expect(guestEmail.html).toContain("Hi Gina,");
    expect(guestEmail.html).toContain(
      "this Sunday, November 1 at 2:30 PM at The Starry Plough Pub, 3101 Shattuck Ave., Berkeley, CA 94705."
    );
    expect(guestEmail.html).toContain('href="https://singjam.org/set/set-1"');
  });

  it("uses the message saved in admin settings", async () => {
    const { admin } = makeAdmin({ savedMessage: "Hey {name}, see you {day}!" });
    const resend = makeResend();
    await sendEventReminders(admin, resend as any, FRIDAY_8AM);
    const guestEmail = resend.batch.send.mock.calls[0][0].find((p: any) => p.to === "guest@example.com");
    expect(guestEmail.html).toContain("Hey Gina, see you Sunday!");
  });

  it("sends nothing when the claim can't be written", async () => {
    const { admin } = makeAdmin({ claimError: { code: "23505" } });
    const resend = makeResend();
    expect(await sendEventReminders(admin, resend as any, FRIDAY_8AM)).toBe(0);
    expect(resend.batch.send).not.toHaveBeenCalled();
  });

  it("releases the claim when every send fails, so the next run retries", async () => {
    const { admin, del } = makeAdmin();
    expect(await sendEventReminders(admin, makeResend({ message: "down" }) as any, FRIDAY_8AM)).toBe(0);
    expect(del).toHaveBeenCalled();
  });

  it("does nothing when no reminder is due", async () => {
    const { admin, insert } = makeAdmin();
    await sendEventReminders(admin, makeResend() as any, new Date("2026-10-29T16:00:00Z"));
    expect(insert).not.toHaveBeenCalled();
  });
});
