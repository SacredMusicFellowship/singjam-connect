import { afterEach, describe, expect, it, vi } from "vitest";

const { enrichSong, runEnrichmentReview } = vi.hoisted(() => ({ enrichSong: vi.fn(), runEnrichmentReview: vi.fn() }));
vi.mock("./songEnrichment", () => ({ enrichSong, runEnrichmentReview }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));

import { handler } from "../netlify/functions/enrich-song-background";

const call = (body: object, secret = "s3cret") =>
  handler({ httpMethod: "POST", headers: { "x-enrich-secret": secret }, body: JSON.stringify(body) });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("enrich-song-background", () => {
  it("runs a review when asked for one, and doesn't fill the song", async () => {
    vi.stubEnv("ENRICH_SECRET", "s3cret");
    await call({ songId: "song-1", review: "2026-11-05T00:00:00.000Z" });
    expect(runEnrichmentReview).toHaveBeenCalledWith(expect.anything(), "song-1", "2026-11-05T00:00:00.000Z");
    expect(enrichSong).not.toHaveBeenCalled();
  });

  it("fills a new song otherwise", async () => {
    vi.stubEnv("ENRICH_SECRET", "s3cret");
    enrichSong.mockResolvedValue({ decision: {}, usage: [] });
    await call({ songId: "song-1", spotifyReleaseYear: 1964 });
    expect(enrichSong).toHaveBeenCalledWith(expect.anything(), "song-1", { spotifyReleaseYear: 1964 });
    expect(runEnrichmentReview).not.toHaveBeenCalled();
  });

  it("refuses a request without the secret", async () => {
    vi.stubEnv("ENRICH_SECRET", "s3cret");
    expect(await call({ songId: "song-1", review: "t" }, "wrong")).toEqual({ statusCode: 401 });
    expect(runEnrichmentReview).not.toHaveBeenCalled();
  });
});
