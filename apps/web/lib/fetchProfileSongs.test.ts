import { describe, it, expect, vi } from "vitest";
import { fetchProfileSongs } from "./fetchProfileSongs";

function makeSupabase({
  shared,
  theirSongs,
  songDetails,
  bylines = [],
}: {
  shared: any[];
  theirSongs: any[];
  songDetails: any[];
  bylines?: { song_id: string; byline: string | null }[];
}) {
  return {
    rpc: vi.fn((fn: string) => Promise.resolve({ data: fn === "shared_songs_with" ? shared : bylines })),
    from: vi.fn((table: string) => {
      if (table === "user_songs") {
        const q: any = {
          select: () => q, eq: () => q, order: () => q,
          range: (f: number, t: number) => Promise.resolve({ data: theirSongs.slice(f, t + 1), error: null }),
        };
        return q;
      }
      if (table === "songs") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn((_col: string, ids: string[]) => Promise.resolve({ data: songDetails.filter((d) => ids.includes(d.id)), error: null })),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

describe("fetchProfileSongs", () => {
  it("puts a song the profile owner marked 'learn' into wantsToLearnSongs, not additionalSongs", async () => {
    const supabase = makeSupabase({
      shared: [],
      theirSongs: [{ song_id: "s1", confidence: "learn" }],
      songDetails: [{ id: "s1", title: "Learning Song", display_artist: null, slug: "learning-song" }],
    });

    const { additionalSongs, wantsToLearnSongs } = await fetchProfileSongs(supabase, "profile-1");

    expect(additionalSongs).toEqual([]);
    expect(wantsToLearnSongs).toHaveLength(1);
    expect(wantsToLearnSongs[0]).toMatchObject({ song_id: "s1", confidence: "learn" });
  });

  it("keeps lead/support songs not shared with the viewer in additionalSongs", async () => {
    const supabase = makeSupabase({
      shared: [],
      theirSongs: [
        { song_id: "s1", confidence: "lead" },
        { song_id: "s2", confidence: "support" },
      ],
      songDetails: [
        { id: "s1", title: "Lead Song", display_artist: null, slug: "lead-song" },
        { id: "s2", title: "Support Song", display_artist: null, slug: "support-song" },
      ],
    });

    const { additionalSongs, wantsToLearnSongs } = await fetchProfileSongs(supabase, "profile-1");

    expect(additionalSongs.map((s) => s.song_id).sort()).toEqual(["s1", "s2"]);
    expect(wantsToLearnSongs).toEqual([]);
  });

  it("puts songs both users can lead/support into sharedSongs", async () => {
    const supabase = makeSupabase({
      shared: [{ song_id: "s1", title: "Shared Song", display_artist: null, slug: "shared-song" }],
      theirSongs: [{ song_id: "s1", confidence: "lead" }],
      songDetails: [],
    });

    const { sharedSongs, additionalSongs, wantsToLearnSongs } = await fetchProfileSongs(supabase, "profile-1");

    expect(sharedSongs).toHaveLength(1);
    expect(sharedSongs[0]).toMatchObject({ song_id: "s1", confidence: "lead" });
    expect(additionalSongs).toEqual([]);
    expect(wantsToLearnSongs).toEqual([]);
  });

  it("returns empty lists when the profile owner has no songs", async () => {
    const supabase = makeSupabase({ shared: [], theirSongs: [], songDetails: [] });

    const { sharedSongs, additionalSongs, wantsToLearnSongs } = await fetchProfileSongs(supabase, "profile-1");

    expect(sharedSongs).toEqual([]);
    expect(additionalSongs).toEqual([]);
    expect(wantsToLearnSongs).toEqual([]);
  });

  it("loads every song of a profile with more than a page of them, and shared songs' bylines", async () => {
    const theirSongs = Array.from({ length: 1200 }, (_, i) => ({ song_id: `s${i}`, confidence: "lead" }));
    const supabase = makeSupabase({
      shared: [{ song_id: "s0", title: "Shared", display_artist: "Someone", slug: "shared" }],
      theirSongs,
      songDetails: theirSongs.map((r) => ({ id: r.song_id, title: r.song_id, display_artist: null, byline: null, slug: null })),
      bylines: [{ song_id: "s0", byline: "Traditional · Irish" }],
    });

    const { sharedSongs, additionalSongs } = await fetchProfileSongs(supabase, "profile-1");

    expect(sharedSongs[0].byline).toBe("Traditional · Irish");
    expect(additionalSongs).toHaveLength(1199);
  });
});
