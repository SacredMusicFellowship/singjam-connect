import { describe, it, expect, vi, beforeEach } from "vitest";
import { runYouTubeBackfill } from "./youtubeBackfill";

type Row = { song_id: string; artist_id: string; youtube_url: string | null; recorded_title?: string | null; songs: { title: string; song_alternate_titles?: { title: string }[] }; artists: { name: string } };

// select() calls are answered in order: first the unchecked links, then the search candidates.
function fakeAdmin(unchecked: Row[], candidates: Row[]) {
  const updates: { values: Record<string, unknown>; song_id: string }[] = [];
  const answers = [unchecked, candidates];
  const query = (): any => {
    const data = answers.shift() ?? [];
    const chain: any = {};
    for (const m of ["not", "is", "or", "order"]) chain[m] = () => chain;
    chain.limit = async () => ({ data, error: null });
    return chain;
  };
  const admin = {
    from: () => ({
      select: query,
      update: (values: Record<string, unknown>) => ({
        eq: (_c: string, song_id: string) => ({ eq: async () => { updates.push({ values, song_id }); return { error: null }; } }),
      }),
    }),
  };
  return { admin: admin as any, updates };
}

const row = (song_id: string, title: string, artist: string, youtube_url: string | null = null): Row => ({
  song_id, artist_id: "a", youtube_url, songs: { title }, artists: { name: artist },
});

function mockYouTube(byPath: (url: string) => unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ json: async () => byPath(url) })));
}

beforeEach(() => vi.unstubAllGlobals());

describe("runYouTubeBackfill", () => {
  it("marks checked links ok or not, and drops links to deleted videos", async () => {
    const { admin, updates } = fakeAdmin(
      [
        row("s1", "Yesterday", "The Beatles", "https://www.youtube.com/watch?v=AAAAAAAAAAA"),
        row("s2", "Yesterday", "The Beatles", "https://www.youtube.com/watch?v=BBBBBBBBBBB"),
        row("s3", "Yesterday", "The Beatles", "https://www.youtube.com/watch?v=CCCCCCCCCCC"),
      ],
      []
    );
    mockYouTube(() => ({
      items: [
        { id: "AAAAAAAAAAA", snippet: { title: "Yesterday (Remastered 2009)", channelTitle: "The Beatles - Topic" } },
        { id: "BBBBBBBBBBB", snippet: { title: "The Beatles - Yesterday (Lyrics)", channelTitle: "7clouds" } },
      ],
    }));

    const result = await runYouTubeBackfill(admin, "key");

    expect(result.verified).toBe(3);
    expect(updates).toEqual([
      { song_id: "s1", values: { youtube_ok: true } },
      { song_id: "s2", values: { youtube_ok: false } },
      { song_id: "s3", values: { youtube_url: null, youtube_ok: null } },
    ]);
  });

  it("stores the first official result, and only stamps the check when none qualifies", async () => {
    const { admin, updates } = fakeAdmin([], [row("s1", "Ripple", "Grateful Dead"), row("s2", "Ripple", "Grateful Dead")]);
    let call = 0;
    mockYouTube(() => {
      call++;
      return call === 1
        ? { items: [
            { id: { videoId: "LIVELIVELIV" }, snippet: { title: "Ripple (Live)", channelTitle: "Grateful Dead - Topic" } },
            { id: { videoId: "STUDIOSTUDI" }, snippet: { title: "Ripple", channelTitle: "Grateful Dead - Topic" } },
          ] }
        : { items: [{ id: { videoId: "FANFANFANFA" }, snippet: { title: "Ripple", channelTitle: "deadhead1977" } }] };
    });

    const result = await runYouTubeBackfill(admin, "key");

    expect(result).toMatchObject({ searched: 2, found: 1 });
    expect(updates[0].values).toMatchObject({ youtube_url: "https://www.youtube.com/watch?v=STUDIOSTUDI", youtube_ok: true });
    expect(Object.keys(updates[1].values)).toEqual(["youtube_checked_at"]);
  });

  it("stops quietly when the daily quota is used up", async () => {
    const { admin, updates } = fakeAdmin([], [row("s1", "Ripple", "Grateful Dead")]);
    mockYouTube(() => ({ error: { message: "quota", errors: [{ reason: "quotaExceeded" }] } }));

    const result = await runYouTubeBackfill(admin, "key");

    expect(result.quotaExceeded).toBe(true);
    expect(updates).toEqual([]);
  });

  it("searches with the title on the record and accepts the song's other titles", async () => {
    const lowBridge: Row = { ...row("s1", "Low Bridge", "Pete Seeger"), recorded_title: "Erie Canal" };
    const { admin, updates } = fakeAdmin([], [lowBridge]);
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      return { json: async () => ({ items: [{ id: { videoId: "ERIEERIEERI" }, snippet: { title: "Erie Canal", channelTitle: "Pete Seeger - Topic" } }] }) };
    }));

    const result = await runYouTubeBackfill(admin, "key");

    expect(decodeURIComponent(urls[0])).toContain("q=Pete Seeger Erie Canal");
    expect(result.found).toBe(1);
    expect(updates[0].values).toMatchObject({ youtube_url: "https://www.youtube.com/watch?v=ERIEERIEERI", youtube_ok: true });
  });

  it("stops quietly when the daily search quota is used up", async () => {
    const { admin, updates } = fakeAdmin([], [row("s1", "Ripple", "Grateful Dead")]);
    mockYouTube(() => ({ error: { message: "Quota exceeded for quota metric 'Search Queries' and limit 'Search Queries per day'", errors: [{ reason: "rateLimitExceeded" }] } }));

    const result = await runYouTubeBackfill(admin, "key");

    expect(result.quotaExceeded).toBe(true);
    expect(updates).toEqual([]);
  });
});
