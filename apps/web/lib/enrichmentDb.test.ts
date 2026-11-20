import { beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => [] as any[]);
vi.mock("@/lib/resend", () => ({ FROM_ADDRESS: "SingJam <hello@singjam.org>", resend: { emails: { send: async (p: any) => { sent.push(p); return { error: null }; } } } }));

import { recordEnrichmentUsage } from "./enrichmentDb";

const usage = [{ model: "gpt-5.5", input: 100, output: 10 }];
const down = [{ name: "GPT", ok: true }, { name: "Claude", ok: false }];
const up = [{ name: "GPT", ok: true }, { name: "Claude", ok: true }];

function fakeDb(history: unknown[]) {
  const inserted: any[] = [];
  const q: any = {
    insert: (row: any) => { inserted.push(row); return Promise.resolve({ error: null }); },
    select: () => q, order: () => q,
    limit: async () => ({ data: history.map((checks) => ({ checks })) }),
  };
  return { db: { from: () => q } as any, inserted };
}

beforeEach(() => { sent.length = 0; });

describe("recordEnrichmentUsage", () => {
  it("records which sources answered", async () => {
    const { db, inserted } = fakeDb([]);
    await recordEnrichmentUsage(db, "song-1", "fill", usage, up);
    expect(inserted[0]).toMatchObject({ song_id: "song-1", kind: "fill", checks: up });
    expect(sent).toEqual([]);
  });

  it("emails the admin once a model has failed five runs in a row", async () => {
    const { db } = fakeDb([down, down, down, down, down, up]);
    await recordEnrichmentUsage(db, "song-1", "fill", usage, down);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Song enrichment: Claude hasn't answered in 5 runs");
  });

  it("stays quiet on a failure short of the streak", async () => {
    const { db } = fakeDb([down, down, up]);
    await recordEnrichmentUsage(db, "song-1", "fill", usage, down);
    expect(sent).toEqual([]);
  });
});
