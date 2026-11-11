import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: async () => ({ model: "gpt", usage: {}, choices: [{ message: { content: JSON.stringify({ fields: { tonality: { v: "Major", c: "high" } } }) } }] }) } };
  },
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = {
      messages: {
        create: async () => {
          throw new Error("overloaded");
        },
      },
    };
  },
}));

import { gatherSources, type SongContext } from "./songEnrichment";

const song = (wanted: SongContext["wanted"]): SongContext => ({ title: "Twist and Shout", artist: "The Beatles", production: null, wanted });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("gatherSources", () => {
  it("keeps going when one source throws, and records which answered", async () => {
    vi.stubEnv("OPENAI_API_KEY", "k");
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const { sources, checks } = await gatherSources(song(["tonality", "first_line"]));

    expect(sources.gpt?.tonality?.v).toBe("Major");
    expect(sources.claude).toBeNull();
    expect(sources.lyrics).toBeNull();
    expect(checks).toEqual(expect.arrayContaining([{ name: "GPT", ok: true }, { name: "Claude", ok: false }, { name: "LRCLIB", ok: false }]));
  });

  it("gives up on a source that hangs instead of stalling the run", async () => {
    vi.useFakeTimers();
    vi.stubEnv("OPENAI_API_KEY", "k");
    vi.stubEnv("GENIUS_ACCESS_TOKEN", "k");
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    const run = gatherSources(song(["tonality"]), { links: true });
    await vi.advanceTimersByTimeAsync(20_001);
    const { geniusUrl, checks } = await run;

    expect(geniusUrl).toBeNull();
    expect(checks).toContainEqual({ name: "Genius", ok: false });
  });

  it("only asks the sources a wanted field needs", async () => {
    vi.stubEnv("OPENAI_API_KEY", "k");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { checks } = await gatherSources(song(["tonality"]));

    expect(checks.map((c) => c.name)).toEqual(["GPT", "Claude"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
