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
  visibility: "official",
};

// Friday 30 Oct 2026, 8 AM PDT (UTC-7).
const FRIDAY_8AM = new Date("2026-10-30T15:00:00Z");

function makeAdmin({
  jams = [EVENT] as any[],
  claimError = null as any,
  rsvps = [] as any[],
  invites = [] as any[],
  savedMessage = null as string | null,
  eventMessage = null as string | null,
} = {}) {
  const insert = vi.fn().mockResolvedValue({ error: claimError });
  const deleteEq2 = vi.fn().mockResolvedValue({ error: null });
  const del = vi.fn(() => ({ eq: () => ({ eq: deleteEq2 }) }));
  const jamsChain: any = {};
  for (const m of ["select", "eq", "gte"]) jamsChain[m] = vi.fn(() => jamsChain);
  jamsChain.lte = vi.fn().mockResolvedValue({ data: jams, error: null });
  jamsChain.maybeSingle = vi.fn().mockResolvedValue({ data: { reminder_message: eventMessage }, error: null });

  const admin = {
    from: vi.fn((table: string) => {
      if (table === "jams") return jamsChain;
      if (table === "jam_reminders_sent") return { insert, delete: del };
      if (table === "jam_rsvps") return { select: () => ({ eq: () => ({ eq: async () => ({ data: rsvps }) }) }) };
      if (table === "jam_invites") return { select: () => ({ eq: () => ({ eq: async () => ({ data: invites }) }) }) };
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

  it("looks at every jam, not only official events", async () => {
    const { admin, jamsChain } = makeAdmin({ jams: [] });
    await sendEventReminders(admin, makeResend() as any, FRIDAY_8AM);
    expect(jamsChain.eq).not.toHaveBeenCalledWith("visibility", "official");
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

  it("uses the event's own message over the saved one", async () => {
    const { admin } = makeAdmin({ savedMessage: "Shared {name}", eventMessage: "Just this event, {name} <b>!</b>" });
    const resend = makeResend();
    await sendEventReminders(admin, resend as any, FRIDAY_8AM);
    const guestEmail = resend.batch.send.mock.calls[0][0].find((p: any) => p.to === "guest@example.com");
    expect(guestEmail.html).toContain("Just this event, Gina &lt;b&gt;!&lt;/b&gt;");
    expect(guestEmail.html).not.toContain("Shared");
  });

  it("falls back to the saved message when the event's is blank", async () => {
    const { admin } = makeAdmin({ savedMessage: "Shared {name}", eventMessage: "   " });
    const resend = makeResend();
    await sendEventReminders(admin, resend as any, FRIDAY_8AM);
    const guestEmail = resend.batch.send.mock.calls[0][0].find((p: any) => p.to === "guest@example.com");
    expect(guestEmail.html).toContain("Shared Gina");
  });

  it("still sends when the event's message can't be read (before migration 170)", async () => {
    const { admin, jamsChain } = makeAdmin({ savedMessage: "Shared {name}" });
    jamsChain.maybeSingle.mockResolvedValue({ data: null, error: { message: 'column "reminder_message" does not exist' } });
    const resend = makeResend();
    await sendEventReminders(admin, resend as any, FRIDAY_8AM);
    const guestEmail = resend.batch.send.mock.calls[0][0].find((p: any) => p.to === "guest@example.com");
    expect(guestEmail.html).toContain("Shared Gina");
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

describe("sendEventReminders — community and private jams", () => {
  const JAM = { ...EVENT, id: "jam-2", name: "Friday <Folk> Jam", visibility: "community" };

  it("sends both reminders on the same schedule as official events", async () => {
    const { admin, insert } = makeAdmin({ jams: [JAM] });
    await sendEventReminders(admin, makeResend() as any, FRIDAY_8AM);
    expect(insert).toHaveBeenCalledWith({ jam_id: "jam-2", reminder_type: "48h" });
    const day = makeAdmin({ jams: [JAM] });
    await sendEventReminders(day.admin, makeResend() as any, new Date("2026-11-01T18:00:00Z"));
    expect(day.insert).toHaveBeenCalledWith({ jam_id: "jam-2", reminder_type: "5h" });
  });

  it("uses the jam's name and 'the song menu', never the official message", async () => {
    const { admin } = makeAdmin({ jams: [JAM], savedMessage: "Official {name}", eventMessage: "Event {name}" });
    const resend = makeResend();
    await sendEventReminders(admin, resend as any, FRIDAY_8AM);
    const html = resend.batch.send.mock.calls[0][0][0].html;
    expect(html).toContain("We&#39;ll see you at Friday &lt;Folk&gt; Jam this Sunday, November 1 at 2:30 PM");
    expect(html).toContain("You can add songs to the song menu");
    expect(html).not.toContain("Official");
    expect(html).not.toContain("Event Host");
  });

  it("emails the host, people going and pending invitees, but not ticket buyers", async () => {
    const { admin } = makeAdmin({
      jams: [JAM],
      rsvps: [{ user_id: "member-1" }],
      invites: [{ invited_user_id: "invitee-1" }, { invited_user_id: null }],
    });
    const resend = makeResend();
    await sendEventReminders(admin, resend as any, FRIDAY_8AM);
    const to = resend.batch.send.mock.calls[0][0].map((p: any) => p.to).sort();
    expect(to).toEqual(["host-1@example.com", "invitee-1@example.com", "member-1@example.com"]);
    expect(mockGuests).not.toHaveBeenCalled();
  });
});
