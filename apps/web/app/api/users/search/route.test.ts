import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetUser, mockRpc } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
  }),
}));

import { GET } from "./route";

function req(q?: string) {
  const url = q !== undefined
    ? `http://localhost/api/users/search?q=${encodeURIComponent(q)}`
    : "http://localhost/api/users/search";
  return new Request(url);
}

const authedUser = { id: "user-123" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: authedUser } });
  mockRpc.mockResolvedValue({ data: [] });
});

describe("GET /api/users/search", () => {
  it("returns empty array when q is missing", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns empty array when q is a single character", async () => {
    const res = await GET(req("a"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns empty array when q is just @ with no username", async () => {
    const res = await GET(req("@"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("strips leading @ before checking length", async () => {
    const res = await GET(req("@a"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req("john"));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "Unauthorized" });
  });

  it("calls search_users RPC with query and excludes current user", async () => {
    await GET(req("john"));
    expect(mockRpc).toHaveBeenCalledWith("search_users", {
      search_query: "john",
      exclude_user_id: authedUser.id,
    });
  });

  it("strips leading @ and passes clean query to RPC", async () => {
    await GET(req("@john"));
    expect(mockRpc).toHaveBeenCalledWith("search_users", {
      search_query: "john",
      exclude_user_id: authedUser.id,
    });
  });

  it("returns RPC results", async () => {
    const users = [
      { id: "u1", username: "alice", display_name: "Alice", last_name: null, avatar_url: null },
      { id: "u2", username: "bob", display_name: "Bob", last_name: null, avatar_url: null },
    ];
    mockRpc.mockResolvedValue({ data: users });
    const res = await GET(req("alice"));
    expect(await res.json()).toEqual(users);
  });

  it("returns empty array when RPC returns null", async () => {
    mockRpc.mockResolvedValue({ data: null });
    const res = await GET(req("nobody"));
    expect(await res.json()).toEqual([]);
  });

  it("trims whitespace from query before processing", async () => {
    const res = await GET(req("  a  "));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("passes multi-word query to RPC unchanged", async () => {
    await GET(req("john smith"));
    expect(mockRpc).toHaveBeenCalledWith("search_users", {
      search_query: "john smith",
      exclude_user_id: authedUser.id,
    });
  });

  it("leaves the searcher out by default", async () => {
    await GET(req("ben"));
    expect(mockRpc).toHaveBeenCalledWith("search_users", { search_query: "ben", exclude_user_id: "user-123" });
  });

  it("includes the searcher when asked, as the leader panel does", async () => {
    await GET(new Request("http://localhost/api/users/search?q=ben&include_self=1"));
    expect(mockRpc).toHaveBeenCalledWith("search_users", {
      search_query: "ben",
      exclude_user_id: "00000000-0000-0000-0000-000000000000",
    });
  });
});
