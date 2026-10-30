import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGetUser, mockBearerGetUser, mockEmailSend, mockFrom, mockGetUserById, mockCanEdit, mockNotify, mockJamUpdate, mockJamDelete } = vi.hoisted(() => ({
  mockBearerGetUser: vi.fn(),
  mockJamDelete: vi.fn(),
  mockJamUpdate: vi.fn(),
  mockCanEdit: vi.fn(),
  mockGetUser: vi.fn(),
  mockEmailSend: vi.fn().mockResolvedValue({ id: "email-id" }),
  mockFrom: vi.fn(),
  mockGetUserById: vi.fn(),
  mockNotify: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn().mockResolvedValue({ auth: { getUser: mockGetUser } }),
}));

vi.mock("@/lib/supabase/bearer", () => ({
  supabaseFromBearer: vi.fn(() => ({ auth: { getUser: mockBearerGetUser } })),
}));

vi.mock("@/lib/resend", () => ({
  resend: { emails: { send: mockEmailSend }, batch: { send: mockEmailSend } },
  FROM_ADDRESS: "SingJam <hello@singjam.org>",
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    auth: { admin: { getUserById: mockGetUserById } },
  })),
}));

vi.mock("@/lib/jamAuthz", () => ({ canEditJamById: mockCanEdit }));
vi.mock("@/lib/notifications", () => ({ createNotification: mockNotify }));

import { PUT, DELETE } from "./route";

const storedJam = {
  host_user_id: "host-id",
  name: "SingJam at the Starry Plough",
  starts_at: "2026-10-04T21:30:00+00:00",
  ends_at: "2026-10-04T23:30:00+00:00",
  neighborhood: "Berkeley, CA",
  full_address: "The Starry Plough Pub, Shattuck Avenue, Berkeley, CA, USA",
  timezone: "America/Los_Angeles",
  visibility: "official",
};

function chain(result: { data: unknown; error?: unknown }, onUpdate?: (row: unknown) => void, onDelete?: () => void) {
  const resolved = { error: null, ...result };
  const c: any = {
    select: () => c, eq: () => c, in: () => c, insert: () => c,
    delete: () => { onDelete?.(); return c; },
    update: (row: unknown) => { onUpdate?.(row); return c; },
    maybeSingle: () => Promise.resolve(resolved),
    then: (res: any, rej: any) => Promise.resolve(resolved).then(res, rej),
  };
  return c;
}

const params = Promise.resolve({ id: "jam-1" });

function put(overrides: Record<string, unknown>, headers: Record<string, string> = {}) {
  const body = {
    name: storedJam.name,
    starts_at: "2026-10-04T21:30:00.000Z",
    ends_at: "2026-10-04T23:30:00.000Z",
    neighborhood: storedJam.neighborhood,
    full_address: storedJam.full_address,
    ...overrides,
  };
  return PUT(new Request("http://localhost/api/jam/jam-1", { method: "PUT", headers, body: JSON.stringify(body) }), { params });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCanEdit.mockResolvedValue(true);
  mockGetUser.mockResolvedValue({ data: { user: { id: "host-id" } } });
  mockGetUserById.mockResolvedValue({ data: { user: { email: "alice@example.com" } } });
  mockFrom.mockImplementation((table: string) => {
    if (table === "jams") return chain({ data: storedJam }, mockJamUpdate, mockJamDelete);
    if (table === "jam_rsvps") return chain({ data: [{ user_id: "attendee-1" }] });
    if (table === "profiles") return chain({ data: [{ id: "attendee-1", display_name: "Alice" }] });
    return chain({ data: [] });
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("PUT /api/jam/[id] under next dev", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_DEV_SIDE_EFFECTS", "");
  });

  it("keeps an existing public jam's visibility when it is re-saved unchanged", async () => {
    const res = await put({ visibility: "official" });
    expect(res.status).toBe(200);
    expect(mockJamUpdate.mock.calls[0][0]).toMatchObject({ visibility: "official" });
  });

  it("refuses to make a jam public", async () => {
    const res = await put({ visibility: "community" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Local dev: jams can only be made private");
    expect(mockJamUpdate).not.toHaveBeenCalled();
  });

  it("lets a jam be made private", async () => {
    const res = await put({ visibility: "private" });
    expect(res.status).toBe(200);
    expect(mockJamUpdate.mock.calls[0][0]).toMatchObject({ visibility: "private" });
  });

  it("allows any change when ALLOW_DEV_SIDE_EFFECTS=true", async () => {
    vi.stubEnv("ALLOW_DEV_SIDE_EFFECTS", "true");
    const res = await put({ visibility: "community" });
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/jam/[id]", () => {
  it("does not email attendees when the time is re-saved in a different ISO format", async () => {
    const res = await put({});
    expect(res.status).toBe(200);
    expect(mockEmailSend).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("emails attendees when the start time actually changes", async () => {
    const res = await put({ starts_at: "2026-10-04T22:00:00.000Z" });
    expect(res.status).toBe(200);
    expect(mockEmailSend).toHaveBeenCalledTimes(1);
  });

  it("emails attendees when the location actually changes", async () => {
    const res = await put({ full_address: "Somewhere else" });
    expect(res.status).toBe(200);
    expect(mockEmailSend).toHaveBeenCalledTimes(1);
  });

  it("accepts a native request authenticated with a bearer token", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockBearerGetUser.mockResolvedValue({ data: { user: { id: "host-id" } } });
    const res = await put({}, { Authorization: "Bearer token" });
    expect(res.status).toBe(200);
    expect(mockJamUpdate).toHaveBeenCalled();
  });

  it("returns 401 with neither a session nor a bearer token", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await put({});
    expect(res.status).toBe(401);
    expect(mockJamUpdate).not.toHaveBeenCalled();
  });

  it("stores the venue timezone the client resolved", async () => {
    await put({ timezone: "America/New_York", full_address: "Brooklyn, NY" });
    expect(mockJamUpdate).toHaveBeenCalledWith(expect.objectContaining({ timezone: "America/New_York" }));
  });

  it("keeps the stored timezone when none, or an invalid one, is sent", async () => {
    await put({});
    await put({ timezone: "Not/AZone" });
    for (const [row] of mockJamUpdate.mock.calls) {
      expect(row).toEqual(expect.objectContaining({ timezone: "America/Los_Angeles" }));
    }
  });
});

describe("edit rights", () => {
  it("refuses a PUT from someone who cannot edit the jam, such as a co-host", async () => {
    mockCanEdit.mockResolvedValue(false);
    const res = await put({});
    expect(res.status).toBe(403);
    expect(mockJamUpdate).not.toHaveBeenCalled();
  });

  it("refuses a DELETE from someone who cannot edit the jam", async () => {
    mockCanEdit.mockResolvedValue(false);
    const res = await DELETE(new Request("http://localhost/api/jam/jam-1", { method: "DELETE" }), { params });
    expect(res.status).toBe(403);
    expect(mockJamDelete).not.toHaveBeenCalled();
    expect(mockEmailSend).not.toHaveBeenCalled();
  });

  it("deletes through the admin client so an official host who did not create the event can cancel it", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "official-host" } } });
    const res = await DELETE(new Request("http://localhost/api/jam/jam-1", { method: "DELETE" }), { params });
    expect(res.status).toBe(200);
    expect(mockJamDelete).toHaveBeenCalledTimes(1);
  });

  it("does not tell attendees an event was cancelled when the delete fails", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "jams") {
        const c = chain({ data: storedJam });
        c.delete = () => chain({ data: null, error: { message: "boom" } });
        return c;
      }
      return chain({ data: [] });
    });
    const res = await DELETE(new Request("http://localhost/api/jam/jam-1", { method: "DELETE" }), { params });
    expect(res.status).toBe(500);
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockEmailSend).not.toHaveBeenCalled();
  });
});

describe("publishing an official event", () => {
  const community = { ...storedJam, visibility: "community" };

  function withProfile(profile: unknown) {
    mockFrom.mockImplementation((table: string) => {
      if (table === "jams") return chain({ data: community }, mockJamUpdate);
      if (table === "profiles") return chain({ data: profile });
      return chain({ data: [] });
    });
  }

  it("refuses a member turning their own jam official, which the admin client would otherwise let past the trigger", async () => {
    withProfile({ role: "member", can_host_official: false });
    const res = await put({ visibility: "official" });
    expect(res.status).toBe(403);
    expect(mockJamUpdate).not.toHaveBeenCalled();
  });

  it("lets an official host make their jam official", async () => {
    withProfile({ role: "member", can_host_official: true });
    const res = await put({ visibility: "official" });
    expect(res.status).toBe(200);
    expect(mockJamUpdate).toHaveBeenCalled();
  });

  it("lets an admin make a jam official", async () => {
    withProfile({ role: "admin", can_host_official: false });
    const res = await put({ visibility: "official" });
    expect(res.status).toBe(200);
  });
});
