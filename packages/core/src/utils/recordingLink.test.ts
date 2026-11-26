import { describe, expect, it } from "vitest";
import { parseRecordingLink } from "./recordingLink";

const yt = { kind: "youtube", id: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" };
const sp = { kind: "spotify", trackId: "4uLU6hMCjMI75M1A2tKUQC", url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC" };

describe("parseRecordingLink", () => {
  it("reads every usual YouTube shape", () => {
    for (const link of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ?si=abc",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "youtube.com/watch?v=dQw4w9WgXcQ",
      "  https://youtu.be/dQw4w9WgXcQ  ",
    ])
      expect(parseRecordingLink(link)).toEqual(yt);
  });

  it("reads Spotify track links and URIs", () => {
    for (const link of [
      "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
      "https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC?si=xyz",
      "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
    ])
      expect(parseRecordingLink(link)).toEqual(sp);
  });

  it("refuses anything that isn't one video or track", () => {
    for (const link of [
      null,
      "",
      "not a link",
      "https://www.youtube.com/@SomeChannel",
      "https://www.youtube.com/watch?v=short",
      "https://open.spotify.com/album/4uLU6hMCjMI75M1A2tKUQC",
      "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
      "https://example.com/watch?v=dQw4w9WgXcQ",
      "https://hymnary.org/text/love_divine_all_loves_excelling",
    ])
      expect(parseRecordingLink(link)).toBeNull();
  });
});
