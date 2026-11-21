import { describe, it, expect, vi, beforeEach } from "vitest";

const DELAY = 40;

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  tables: {} as Record<string, any>,
  log: [] as string[],
}));

// Every query resolves after DELAY, like a real round trip, and is keyed by
// table (plus a filter value where one table answers two different reads).
function client() {
  const from = (table: string) => {
    const filters: string[] = [];
    let head = false;
    const c: any = {};
    for (const m of ["order", "in", "is", "limit"]) c[m] = () => c;
    c.select = (_cols: string, opts?: { head?: boolean }) => ((head = !!opts?.head), c);
    c.eq = (col: string, val: string) => (filters.push(`${col}=${val}`), c);
    c.neq = (col: string, val: string) => (filters.push(`${col}!=${val}`), c);
    c.maybeSingle = c.single = () => c;
    c.then = (resolve: any, reject: any) => {
      const key = [`${table}${head ? ":count" : ""}`, ...filters].join("|");
      state.log.push(key);
      const match = Object.keys(state.tables)
        .filter((k) => key.startsWith(k))
        .sort((a, b) => b.length - a.length)[0];
      const result = match ? state.tables[match] : { data: null };
      return new Promise((r) => setTimeout(() => r(result), DELAY)).then(resolve, reject);
    };
    return c;
  };
  const rpc = (name: string) => from(`rpc:${name}`);
  return { from, rpc } as any;
}

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => client() }));
vi.mock("@/lib/supabase/cached", () => ({
  getServerSupabase: async () => client(),
  getServerUser: async () => state.user,
}));
vi.mock("@/lib/shortRef", () => ({ resolveJamId: async (ref: string) => ref }));
vi.mock("@/lib/claimJamInvite", () => ({ claimJamInvite: vi.fn() }));
vi.mock("@/lib/jamGuestBuyers", () => ({ guestTicketBuyers: async () => new Set(["guest@example.com"]) }));
vi.mock("@/lib/resend", () => ({ resend: {}, EVENTS_FROM_ADDRESS: "events@test" }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ SITE_URL: "https://singjam.org" }));
vi.mock("@/components/JamView", () => ({ default: () => null }));
vi.mock("@/components/ShortUrl", () => ({ default: () => null }));

import JamPage from "./page";

const render = async () => {
  const tree: any = await JamPage({
    params: Promise.resolve({ id: "jam-1" }),
    searchParams: Promise.resolve({}),
  });
  return tree.props.children[1].props.data;
};

const jam = (overrides: Record<string, unknown>) => ({
  data: {
    id: "jam-1",
    short_code: "abc",
    name: "Jam",
    visibility: "community",
    host_user_id: "host",
    capacity: null,
    guests_can_invite: false,
    profiles: { display_name: "Host", last_name: null, username: "host" },
    ...overrides,
  },
});

beforeEach(() => {
  state.user = null;
  state.log = [];
});

describe("event page", () => {
  it("shows an anonymous visitor the public leaders and the attending count", async () => {
    state.tables = {
      jams: jam({ visibility: "official", host_user_id: "creator" }),
      "jam_rsvps:count": { count: 12 },
      jam_leaders: {
        data: [
          { id: "l1", jam_id: "jam-1", user_id: "u9", name: null, email: "x@example.com", show_publicly: true, token: "t", order_id: "o1" },
        ],
      },
      profiles: { data: [{ id: "u9", display_name: "Lee", last_name: "Der", username: "lee", avatar_url: null }] },
    };
    const data = await render();
    expect(data.attendingCount).toBe(12);
    expect(data.isOfficial).toBe(true);
    expect(data.hasFullAccess).toBe(true);
    expect(data.canManage).toBe(false);
    expect(data.leaders).toEqual([{ id: "l1", user_id: "u9", name: "Lee Der", username: "lee", avatar_url: null }]);
    expect(data.managedLeaders).toBeNull();
  });

  it("gives the host the invite list and message-attendees count", async () => {
    state.user = { id: "host" };
    state.tables = {
      jams: jam({}),
      "jam_rsvps:count|jam_id=jam-1|status=attending|user_id!=host": { count: 3 },
      "jam_rsvps|jam_id=jam-1|user_id=host": { data: { status: "attending", waitlist_position: null } },
      jam_invites: {
        data: [
          { id: "i1", invited_user_id: "u2", invitee_email: null, status: "pending" },
          { id: "i2", invited_user_id: null, invitee_email: "a@example.com", status: "pending" },
          { id: "i3", invited_user_id: "u3", invitee_email: null, status: "accepted" },
        ],
      },
      profiles: { data: [{ id: "u2", display_name: "Bo", last_name: null, username: "bo" }] },
    };
    const data = await render();
    expect(data.canManage).toBe(true);
    expect(data.canEdit).toBe(true);
    expect(data.isHost).toBe(true);
    expect(data.guestBuyerCount).toBe(1);
    expect(data.messageRecipientCount).toBe(4);
    expect(data.alreadyInvitedIds).toEqual(["u2", "u3"]);
    expect(data.inviteList.map((i: any) => i.id)).toEqual(["i1", "i2"]);
    expect(data.inviteList[0].username).toBe("bo");
  });

  it("gives a signed-in non-manager none of the manager data", async () => {
    state.user = { id: "guest" };
    state.tables = { jams: jam({}) };
    const data = await render();
    expect(data.canManage).toBe(false);
    expect(data.inviteList).toEqual([]);
    expect(data.messageRecipientCount).toBe(0);
    // Their own invite status is read; the host's full invite list is not.
    expect(state.log).toContain("jam_invites|jam_id=jam-1|invited_user_id=guest");
    expect(state.log).not.toContain("jam_invites|jam_id=jam-1");
  });

  // The database is a cross-country round trip away; each sequential wave
  // costs one. The deepest chain here is jam → attending count, and
  // leaders → their profiles, so a visit should take about two round trips.
  it("reads in about two round trips, not one per query", async () => {
    state.tables = {
      jams: jam({ visibility: "official", host_user_id: "creator" }),
      jam_leaders: { data: [{ id: "l1", jam_id: "jam-1", user_id: "u9", show_publicly: true, order_id: null }] },
    };
    const start = Date.now();
    await render();
    expect(Date.now() - start).toBeLessThan(DELAY * 3);
  });
});
