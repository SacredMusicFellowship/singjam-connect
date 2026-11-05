import { describe, it, expect, vi, afterEach } from "vitest";

const { enrichSong } = vi.hoisted(() => ({ enrichSong: vi.fn() }));
vi.mock("./songEnrichment", () => ({ enrichSong }));

import { triggerSongEnrichment } from "./triggerSongEnrichment";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("triggerSongEnrichment", () => {
  it("hands a deployed build's work to the background function, with the secret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://singjam.org");
    vi.stubEnv("ENRICH_SECRET", "s3cret");
    const fetchMock = vi.fn().mockResolvedValue({ status: 202 });
    vi.stubGlobal("fetch", fetchMock);

    await triggerSongEnrichment("song-1", 1964);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://singjam.org/.netlify/functions/enrich-song-background",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "x-enrich-secret": "s3cret" }), body: JSON.stringify({ songId: "song-1", spotifyReleaseYear: 1964 }) })
    );
    expect(enrichSong).not.toHaveBeenCalled();
  });

  it("runs in-process under next dev", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    enrichSong.mockResolvedValue({});

    await triggerSongEnrichment("song-1", null);

    expect(enrichSong).toHaveBeenCalledWith(expect.anything(), "song-1", { spotifyReleaseYear: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
