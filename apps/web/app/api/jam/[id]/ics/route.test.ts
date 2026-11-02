import { describe, it, expect, vi, beforeEach } from "vitest";

const { tables } = vi.hoisted(() => ({ tables: {} as Record<string, any[]> }));

function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "eq"]) c[m] = vi.fn().mockReturnValue(c);
  c.single = vi.fn().mockResolvedValue(result);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  return c;
}

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({ from: (t: string) => chain(tables[t]?.shift() ?? { data: null }) }),
}));

import { GET } from "./route";

const RSVP_ID = "11111111-2222-3333-4444-555555555555";
const jam = (visibility: string) => ({
  name: "Porch Sing",
  starts_at: "2026-11-10T00:00:00Z",
  ends_at: null,
  full_address: "12 Elm St, Springfield",
  neighborhood: "Springfield",
  visibility,
});

async function location(visibility: string, rsvpRow: any, query = "") {
  tables.jams = [{ data: jam(visibility) }];
  tables.jam_rsvps = [{ data: rsvpRow }];
  const res = await GET(new Request(`https://singjam.org/api/jam/jam-1/ics${query}`), {
    params: Promise.resolve({ id: "jam-1" }),
  });
  return (await res.text()).match(/^LOCATION:(.*)$/m)?.[1]?.trim();
}

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
});

describe("GET /api/jam/[id]/ics", () => {
  it("gives anyone an official event's full address", async () => {
    expect(await location("official", null)).toContain("12 Elm St");
  });

  it("gives a public jam's neighbourhood, not its address, without an RSVP", async () => {
    expect(await location("community", null)).toBe("Springfield");
  });

  it("gives a public jam's full address to the link from an attending RSVP", async () => {
    expect(await location("community", { id: RSVP_ID }, `?rsvp=${RSVP_ID}`)).toContain("12 Elm St");
  });

  it("gives the neighbourhood when the RSVP isn't attending this jam", async () => {
    expect(await location("community", null, `?rsvp=${RSVP_ID}`)).toBe("Springfield");
  });
});
