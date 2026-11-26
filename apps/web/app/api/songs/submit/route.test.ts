import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetUser, mockBearerGetUser, mockFrom, mockFindOnSpotify, mockTrigger, mockFindExisting, mockFindKnownArtist, mockFindTextTunes, mockSpotifyTrack } = vi.hoisted(() => ({
  mockFindExisting: vi.fn(),
  mockFindTextTunes: vi.fn(),
  mockSpotifyTrack: vi.fn(),
  mockFindKnownArtist: vi.fn(),
  mockGetUser: vi.fn(),
  mockBearerGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockFindOnSpotify: vi.fn(),
  mockTrigger: vi.fn(),
}));

vi.mock("@/lib/songLookup", () => ({
  findOnSpotify: mockFindOnSpotify, findExistingSong: mockFindExisting, findKnownArtist: mockFindKnownArtist,
  findTextTunes: mockFindTextTunes, spotifyTrack: mockSpotifyTrack,
}));
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
  mockFindKnownArtist.mockResolvedValue(null);
  mockFindTextTunes.mockResolvedValue(null);
  mockSpotifyTrack.mockResolvedValue(null);
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
    expect(inserts.songs.youtube_url).toBeNull();
    expect(mockTrigger).toHaveBeenCalledWith("s1", 1969);
  });

  it("saves a member's hints with the set's jam tags", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const inserts: Record<string, any> = {};
    const setId = "11111111-2222-3333-4444-555555555555";
    mockFrom.mockImplementation((table: string) => {
      const c: any = {};
      for (const m of ["select", "ilike", "is", "limit", "eq"]) c[m] = vi.fn().mockReturnValue(c);
      c.maybeSingle = vi.fn().mockResolvedValue({ data: table === "sets" ? { jam_id: "jam-1" } : null });
      c.then = (resolve: (v: unknown) => void) => resolve({ data: table === "jam_tags" ? [{ tags: { name: "Christmas" } }, { tags: { name: "Christian" } }] : null });
      c.insert = vi.fn((row: any) => {
        inserts[table] = row;
        return { select: () => ({ single: async () => ({ data: table === "songs" ? { id: "s1", slug: "harbour-carol" } : { id: "a1" } }) }) };
      });
      return c;
    });

    const res = await POST(req({ title: "Harbour Carol", artist: "Mara Quill", confirmed: true, known_as: "traditional", first_line_hint: "Lights along the harbour", set_id: setId }));

    expect(res.status).toBe(200);
    expect(inserts.songs).not.toHaveProperty("known_by_recording");
    expect(inserts.songs).toMatchObject({
      first_line: null,
      add_hints: { known_as: "traditional", first_line: "Lights along the harbour", context: ["Christmas", "Christian"] },
    });
  });

  it("keeps a confirmed video that isn't an official upload as the song's own, off the recording", async () => {
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
    expect(inserts.songs.youtube_url).toBe("https://www.youtube.com/watch?v=abcdefghijk");
  });

  it("drops a stand-in artist like \"Traditional\" and keeps the confirmed video as the song's own", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const inserts: Record<string, any> = {};
    mockFrom.mockImplementation((table: string) => {
      const c: any = {};
      for (const m of ["select", "ilike", "is", "limit", "eq"]) c[m] = vi.fn().mockReturnValue(c);
      c.maybeSingle = vi.fn().mockResolvedValue({ data: null });
      c.insert = vi.fn((row: any) => {
        inserts[table] = row;
        return { select: () => ({ single: async () => ({ data: { id: "s1", slug: "harbour-carol" } }) }) };
      });
      return c;
    });

    await POST(req({ title: "Harbour Carol", artist: "Traditional", confirmed: true, youtube_id: "abcdefghijk", youtube_official: false }));

    expect(inserts.songs).toMatchObject({ display_artist: null, youtube_url: "https://www.youtube.com/watch?v=abcdefghijk" });
    expect(inserts.song_recording_artists).toBeUndefined();
  });

  it("files a misspelled artist under the artist we already have, whatever the client sent", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockFindKnownArtist.mockResolvedValue({ id: "fm", name: "Fleetwood Mac" });
    const inserts: Record<string, any> = {};
    mockFrom.mockImplementation((table: string) => {
      const c: any = {};
      for (const m of ["select", "ilike", "is", "limit", "eq"]) c[m] = vi.fn().mockReturnValue(c);
      c.maybeSingle = vi.fn().mockResolvedValue({ data: null });
      c.insert = vi.fn((row: any) => {
        inserts[table] = row;
        return { select: () => ({ single: async () => ({ data: { id: "s1", slug: "everywhere" } }) }) };
      });
      return c;
    });

    await POST(req({ title: "Everywhere", artist: "Fleewood Mac", confirmed: true }));

    expect(mockFindExisting).toHaveBeenCalledWith(expect.anything(), ["Everywhere", "Everywhere"], "Fleetwood Mac");
    expect(inserts.songs.display_artist).toBe("Fleetwood Mac");
    expect(inserts.song_recording_artists.artist_id).toBe("fm");
    expect(inserts.artists).toBeUndefined();
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

  describe("another tune of a text we hold", () => {
    const hymn = { id: "s-beacon", slug: "harbour-hymn", title: "Harbour Hymn", display_artist: null, match: "possible" };
    const family = {
      text_id: "x1",
      tunes: [{ id: "s-beacon", slug: "harbour-hymn", title: "Harbour Hymn", display_artist: null, tune_id: "t-beacon", tune: "Beacon" }],
    };
    function db(tuneFound: { id: string } | null = null) {
      const inserts: Record<string, any> = {};
      mockFrom.mockImplementation((table: string) => {
        const c: any = {};
        for (const m of ["select", "ilike", "is", "limit", "eq"]) c[m] = vi.fn().mockReturnValue(c);
        c.maybeSingle = vi.fn().mockResolvedValue({ data: table === "tunes" ? tuneFound : null, error: null });
        c.insert = vi.fn((row: any) => {
          inserts[table] = row;
          return { select: () => ({ single: async () => ({ data: table === "songs" ? { id: "s-new", slug: "harbour-hymn-2" } : { id: "a1" } }) }) };
        });
        return c;
      });
      return inserts;
    }
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
      mockFindExisting.mockResolvedValue(hymn);
      mockFindTextTunes.mockResolvedValue(family);
    });

    it("needs a link to a recording of the tune", async () => {
      db();
      const res = await POST(req({ title: "Harbour Hymn", confirmed: true, add_anyway: true, new_tune: { recording_url: "not a link" } }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/link to a recording/);
    });

    it("adds it to the text with the video as its own, and tells enrichment it's another tune", async () => {
      const inserts = db();
      const res = await POST(req({
        title: "harbour hymn", artist: "Mara Quill", confirmed: true, add_anyway: true, youtube_id: "abcdefghijk",
        new_tune: { recording_url: "https://youtu.be/dQw4w9WgXcQ", name: " Westerly " },
      }));
      expect(res.status).toBe(200);
      expect(inserts.songs).toMatchObject({
        title: "Harbour Hymn", display_artist: null, text_id: "x1", tune_id: null,
        youtube_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        add_hints: { other_tune: true, tune: "Westerly" },
      });
      expect(inserts.song_recording_artists).toBeUndefined();
    });

    it("links a tune we have by its name, and opens the song already sung to it", async () => {
      let inserts = db({ id: "t-westerly" });
      await POST(req({ title: "Harbour Hymn", confirmed: true, add_anyway: true, new_tune: { recording_url: "https://youtu.be/dQw4w9WgXcQ", name: "Westerly" } }));
      expect(inserts.songs).toMatchObject({ tune_id: "t-westerly", add_hints: { other_tune: true } });
      expect(inserts.songs.add_hints).not.toHaveProperty("tune");

      inserts = db({ id: "t-beacon" });
      const res = await POST(req({ title: "Harbour Hymn", confirmed: true, add_anyway: true, new_tune: { recording_url: "https://youtu.be/dQw4w9WgXcQ", name: "Beacon" } }));
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ id: "s-beacon" });
      expect(inserts.songs).toBeUndefined();
    });

    it("adds a same-titled song by a recording artist the usual way, off the text", async () => {
      const inserts = db();
      const res = await POST(req({ title: "Harbour Hymn", artist: "Mara Quill", confirmed: true, add_anyway: true }));
      expect(res.status).toBe(200);
      expect(mockFindTextTunes).not.toHaveBeenCalled();
      expect(inserts.songs).toMatchObject({ display_artist: "Mara Quill", text_id: null });
    });

    it("needs the link when there's no artist, even without a tune sent", async () => {
      db();
      const res = await POST(req({ title: "Harbour Hymn", confirmed: true, add_anyway: true }));
      expect(res.status).toBe(400);
    });

    it("takes the performer of a Spotify link as the recording", async () => {
      mockSpotifyTrack.mockResolvedValue({ title: "Harbour Hymn", artist: "Mara Quill", spotify_url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", release_year: 2019 });
      const inserts = db();
      await POST(req({ title: "Harbour Hymn", confirmed: true, add_anyway: true, new_tune: { recording_url: "spotify:track:4uLU6hMCjMI75M1A2tKUQC" } }));
      expect(inserts.songs).toMatchObject({ display_artist: "Mara Quill", youtube_url: null, text_id: "x1" });
      expect(inserts.song_recording_artists).toMatchObject({ spotify_url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC" });
    });
  });

  it("answers 409, not 500, when the title is already taken by a song with no artist or tune", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockFrom.mockImplementation(() => {
      const c: any = {};
      for (const m of ["select", "ilike", "is", "limit", "eq"]) c[m] = vi.fn().mockReturnValue(c);
      c.maybeSingle = vi.fn().mockResolvedValue({ data: null });
      c.insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: null, error: { code: "23505", message: "duplicate key" } }) }) }));
      return c;
    });
    const res = await POST(req({ title: "Harbour Hymn", confirmed: true }));
    expect(res.status).toBe(409);
  });
});
