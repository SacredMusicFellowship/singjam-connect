import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetUser, mockEmailSend, mockFrom, mockGetUserById } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockEmailSend: vi.fn().mockResolvedValue({ id: "email-id" }),
  mockFrom: vi.fn(),
  mockGetUserById: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock("@/lib/resend", () => ({
  resend: { emails: { send: mockEmailSend } },
  FROM_ADDRESS: "SingJam <hello@singjam.org>",
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    auth: { admin: { getUserById: mockGetUserById } },
  })),
}));
vi.mock("@/lib/shortRef", () => ({
  jamPathById: async (id: string) => `/jam/${id}`,
  setPathById: async (id: string) => `/set/${id}`,
}));

import { POST } from "./route";

function makeRequest(body: object) {
  return new Request("http://localhost/api/jam/test-jam-id/invite/nudge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "test-jam-id" });

const pendingMemberInvite = {
  id: "invite-1",
  status: "pending",
  invited_user_id: "invitee-id",
  invitee_email: null,
  token: "token-abc",
};

const pendingEmailInvite = {
  id: "invite-2",
  status: "pending",
  invited_user_id: null,
  invitee_email: "guest@example.com",
  token: "token-xyz",
};

function cohostLookup(data: { user_id: string } | null) {
  return {
    select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => ({ data }) }) }) }),
  };
}

function setupMocks({ invite }: { invite: typeof pendingMemberInvite | typeof pendingEmailInvite }) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "jams") {
      return {
        select: () => ({
          eq: () => ({
            single: () => ({
              data: { host_user_id: "host-id", name: "Test Jam", starts_at: "2026-06-10T19:00:00Z", timezone: "America/New_York" },
            }),
          }),
        }),
      };
    }
    if (table === "jam_invites") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () => ({ data: invite }),
            }),
          }),
        }),
      };
    }
    if (table === "profiles") {
      return {
        select: () => ({ eq: () => ({ single: () => ({ data: { display_name: "Ben", username: null } }) }) }),
      };
    }
    return {};
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "host-id" } } });
});

describe("POST /api/jam/[id]/invite/nudge", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(makeRequest({ inviteId: "invite-1" }), { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is neither host nor co-host", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "other-user" } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === "jams") {
        return {
          select: () => ({
            eq: () => ({
              single: () => ({ data: { host_user_id: "host-id", name: "Test Jam", starts_at: null, timezone: null } }),
            }),
          }),
        };
      }
      if (table === "jam_cohosts") return cohostLookup(null);
      return {};
    });

    const res = await POST(makeRequest({ inviteId: "invite-1" }), { params });
    expect(res.status).toBe(403);
  });

  it("allows a co-host (not the host) to nudge an invite", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "cohost-id" } } });
    setupMocks({ invite: pendingMemberInvite });
    mockGetUserById.mockResolvedValue({ data: { user: { email: "member@example.com" } } });
    const baseFrom = mockFrom.getMockImplementation()!;
    mockFrom.mockImplementation((table: string) => {
      if (table === "jam_cohosts") return cohostLookup({ user_id: "cohost-id" });
      return baseFrom(table);
    });

    const res = await POST(makeRequest({ inviteId: "invite-1" }), { params });
    expect(res.status).toBe(200);
  });

  it("returns 400 when inviteId is missing", async () => {
    const res = await POST(makeRequest({}), { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 when invite is not pending", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "jams") {
        return {
          select: () => ({
            eq: () => ({
              single: () => ({ data: { host_user_id: "host-id", name: "Test Jam", starts_at: null, timezone: null } }),
            }),
          }),
        };
      }
      if (table === "jam_invites") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ single: () => ({ data: { ...pendingMemberInvite, status: "accepted" } }) }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ single: () => ({ data: { display_name: "Ben", username: null } }) }) }) };
      }
      return {};
    });

    const res = await POST(makeRequest({ inviteId: "invite-1" }), { params });
    expect(res.status).toBe(400);
  });

  it("sends a nudge email to a member invitee", async () => {
    setupMocks({ invite: pendingMemberInvite });
    mockGetUserById.mockResolvedValue({ data: { user: { email: "member@example.com" } } });

    const res = await POST(makeRequest({ inviteId: "invite-1" }), { params });

    expect(res.status).toBe(200);
    expect(mockEmailSend).toHaveBeenCalledTimes(1);
    const call = mockEmailSend.mock.calls[0][0];
    expect(call.to).toBe("member@example.com");
    expect(call.subject).toContain("Reminder");
    expect(call.html).toContain("invite");
  });

  it("sends a nudge email to a non-member invitee", async () => {
    setupMocks({ invite: pendingEmailInvite });

    const res = await POST(makeRequest({ inviteId: "invite-2" }), { params });

    expect(res.status).toBe(200);
    expect(mockEmailSend).toHaveBeenCalledTimes(1);
    const call = mockEmailSend.mock.calls[0][0];
    expect(call.to).toBe("guest@example.com");
  });
});
