import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetUser, mockBearerGetUser, mockFrom, mockFindOnSpotify, mockTrigger, mockFindExisting } = vi.hoisted(() => ({
  mockFindExisting: vi.fn(),
  mockGetUser: vi.fn(),
  mockBearerGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockFindOnSpotify: vi.fn(),
  mockTrigger: vi.fn(),
}));

vi.mock("@/lib/songLookup", () => ({ findOnSpotify: mockFindOnSpotify, findExistingSong: mockFindExisting }));
vi.mock("@/lib/triggerSongEnrichment", () => ({ triggerSongEnrichment: mockTrigger }));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn().mockResolvedValue({ auth: { getUser: mockGetUser } }),
}));

vi.mock("@/lib/supabase/bearer", () => ({
  supabaseFromBearer: vi.fn(() => ({ auth: { getUser: mockBearerGetUser } })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: vi.fn(() => ({ from: mockFrom })),
}));

import { POST } from "./route";

// Chain that resolves the duplicate-check query (select→ilike→ilike/is→limit→maybeSingle).
function dupeChain(existing: any) {
  const c: any = {};
  for (const m of ["select", "ilike", "is", "limit"]) c[m] = vi.fn().mockReturnValue(c);
  c.maybeSingle = vi.fn().mockResolvedValue({ data: existing });
  return c;
}

function req(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/songs/submit", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindOnSpotify.mockResolvedValue(null);
  mockFindExisting.mockResolvedValue(null);
});


describe("POST /api/songs/submit", () => {
  it("returns 401 when neither cookie session nor bearer token authenticates", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(req({ title: "Proud Mary" }));
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 400 when the title is blank", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(req({ title: "  " }));
    expect(res.status).toBe(400);
  });

  it("authenticates via bearer token when there is no cookie session (native)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockBearerGetUser.mockResolvedValue({ data: { user: { id: "u2" } } });
    // Existing match short-circuits to 409 — enough to prove auth passed the gate.
    mockFindExisting.mockResolvedValue({ id: "song-1", slug: "proud-mary", title: "Proud Mary", display_artist: "CCR", match: "same" });

    const res = await POST(req({ title: "Proud Mary", artist: "CCR" }, { Authorization: "Bearer tok" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ id: "song-1", slug: "proud-mary" });
  });

  it("adds a confirmed song, keeps an official YouTube link, and starts enrichment", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const inserts: Record<string, any> = {};
    mockFrom.mockImplementation((table: string) => {
      const c: any = {};
      for (const m of ["select", "ilike", "is", "limit", "eq"]) c[m] = vi.fn().mockReturnValue(c);
      c.maybeSingle = vi.fn().mockResolvedValue({ data: null });
      c.insert = vi.fn((row: any) => {
        inserts[table] = row;
        return { select: () => ({ single: async () => ({ data: table === "songs" ? { id: "s1", slug: "proud-mary" } : { id: "a1" } }) }) };
      });
      return c;
    });

    const res = await POST(req({ title: "Proud Mary", artist: "Creedence Clearwater Revival", confirmed: true, spotify_url: "https://open.spotify.com/track/x", release_year: 1969, youtube_id: "5hid10y4bWs", youtube_official: true }));

    expect(res.status).toBe(200);
    expect(mockFindOnSpotify).not.toHaveBeenCalled();
    expect(inserts.songs).toMatchObject({ title: "Proud Mary", display_artist: "Creedence Clearwater Revival", submitted_by: "u1" });
    expect(inserts.songs).not.toHaveProperty("needs_review");
    expect(inserts.song_recording_artists).toMatchObject({ spotify_url: "https://open.spotify.com/track/x", youtube_url: "https://www.youtube.com/watch?v=5hid10y4bWs", youtube_ok: true });
    expect(mockTrigger).toHaveBeenCalledWith("s1", 1969);
  });

  it("doesn't store a preview video that isn't an official upload", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const inserts: Record<string, any> = {};
    mockFrom.mockImplementation((table: string) => {
      const c: any = {};
      for (const m of ["select", "ilike", "is", "limit", "eq"]) c[m] = vi.fn().mockReturnValue(c);
      c.maybeSingle = vi.fn().mockResolvedValue({ data: null });
      c.insert = vi.fn((row: any) => {
        inserts[table] = row;
        return { select: () => ({ single: async () => ({ data: table === "songs" ? { id: "s1", slug: "x" } : { id: "a1" } }) }) };
      });
      return c;
    });

    await POST(req({ title: "Ripple", artist: "Grateful Dead", confirmed: true, youtube_id: "abcdefghijk", youtube_official: false }));

    expect(inserts.song_recording_artists.youtube_url).toBeNull();
  });

  it("matches an unconfirmed title on Spotify first (older clients)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockFindOnSpotify.mockResolvedValue({ title: "Proud Mary", artist: "Creedence Clearwater Revival", spotify_url: "u", release_year: 1969 });
    mockFindExisting.mockResolvedValue({ id: "song-1", slug: "proud-mary", title: "Proud Mary", display_artist: "Creedence Clearwater Revival", match: "same" });

    const res = await POST(req({ title: "proud mary", artist: "ccr" }));

    expect(mockFindOnSpotify).toHaveBeenCalledWith("proud mary", "ccr");
    expect(res.status).toBe(409);
  });

  it("looks for an existing copy under both the typed and the matched title, and won't duplicate a same-song match", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockFindExisting.mockResolvedValue({ id: "s-old", slug: "the-sounds-of-silence", title: "The Sounds of Silence", display_artist: "Simon & Garfunkel", match: "same" });

    const res = await POST(req({ title: "The Sound of Silence", artist: "Simon & Garfunkel", confirmed: true, add_anyway: true }));

    expect(mockFindExisting).toHaveBeenCalledWith(expect.anything(), ["The Sound of Silence", "The Sound of Silence"], "Simon & Garfunkel");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ slug: "the-sounds-of-silence" });
  });

  it("lets a possible match through when the user says it's a different song", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockFindExisting.mockResolvedValue({ id: "s-old", slug: "summertime", title: "Summertime", display_artist: null, match: "possible" });
    mockFrom.mockImplementation((table: string) => {
      const c: any = {};
      for (const m of ["select", "ilike", "is", "limit", "eq"]) c[m] = vi.fn().mockReturnValue(c);
      c.maybeSingle = vi.fn().mockResolvedValue({ data: null });
      c.insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: table === "songs" ? { id: "s1", slug: "summertime-1" } : { id: "a1" } }) }) }));
      return c;
    });

    const blocked = await POST(req({ title: "Summertime", artist: "Ella Fitzgerald", confirmed: true }));
    const added = await POST(req({ title: "Summertime", artist: "Ella Fitzgerald", confirmed: true, add_anyway: true }));

    expect(blocked.status).toBe(409);
    expect(added.status).toBe(200);
  });
});
