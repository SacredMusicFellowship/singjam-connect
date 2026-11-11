import { describe, it, expect, vi, beforeEach } from "vitest";

const DELAY = 60;

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  tables: {} as Record<string, any>,
  log: [] as string[],
}));

// Every query resolves after DELAY, like a real round trip, and is keyed by
// table (plus a filter value where one table answers two different reads).
function client() {
  const from = (table: string) => {
    const filters: string[] = [];
    let head = false;
    const c: any = {};
    for (const m of ["order", "in", "is", "limit"]) c[m] = () => c;
    c.select = (_cols: string, opts?: { head?: boolean }) => ((head = !!opts?.head), c);
    c.eq = (col: string, val: string) => (filters.push(`${col}=${val}`), c);
    c.neq = (col: string, val: string) => (filters.push(`${col}!=${val}`), c);
    c.maybeSingle = c.single = () => c;
    c.then = (resolve: any, reject: any) => {
      const key = [`${table}${head ? ":count" : ""}`, ...filters].join("|");
      state.log.push(key);
      const match = Object.keys(state.tables)
        .filter((k) => key.startsWith(k))
        .sort((a, b) => b.length - a.length)[0];
      const result = match ? state.tables[match] : { data: null };
      return new Promise((r) => setTimeout(() => r(result), DELAY)).then(resolve, reject);
    };
    return c;
  };
  const rpc = (name: string) => from(`rpc:${name}`);
  return { from, rpc } as any;
}

vi.mock("@supabase/supabase-js", () => ({ createClient: () => client() }));
vi.mock("@/lib/supabase/cached", () => ({
  getServerSupabase: async () => client(),
  getServerUser: async () => state.user,
}));
vi.mock("@/lib/shortRef", () => ({ resolveSetId: async (ref: string) => ref }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); } }));
for (const c of ["SetDetail", "SetRequestAccess", "SetJoinPrompt", "SetGuestPrompt", "ShortUrl"]) {
  vi.doMock(`@/components/${c}`, () => ({ default: () => null }));
}

const { default: SetPage } = await import("./page");

const render = async () => {
  const tree: any = await SetPage({ params: Promise.resolve({ id: "set-1" }), searchParams: Promise.resolve({}) });
  return tree.props.children[1].props;
};

beforeEach(() => {
  state.user = null;
  state.log = [];
  state.tables = {
    sets: { data: { id: "set-1", short_code: "s1", name: "Set", owner_user_id: "owner", jam_id: "jam-1", link_sharing: "public", profiles: null } },
    set_songs: { data: [{ id: "r1", song_id: "song-1", position: 1, songs: { title: "Song" } }] },
    set_collaborators: { data: [] },
    user_songs: { data: [{ user_id: "owner", song_id: "song-1", confidence: "lead", key_note: null }] },
    jams: { data: { id: "jam-1", short_code: "j1" } },
  };
});

describe("set page", () => {
  it("shows a public set with the owner's knowledge and the link back to its event", async () => {
    const props = await render();
    expect(props.initialSongs).toHaveLength(1);
    expect(props.songKnowledge).toEqual([{ user_id: "owner", song_id: "song-1", confidence: "lead", key_note: null }]);
    expect(props.canAccessJam).toBe(true);
    expect(props.jamShortCode).toBe("j1");
    expect(props.isPublicViewer).toBe(true);
  });

  it("hides the event link when the viewer cannot read the jam", async () => {
    state.tables.jams = { data: null };
    const props = await render();
    expect(props.canAccessJam).toBe(false);
    expect(props.jamShortCode).toBeNull();
  });

  // The database is a cross-country round trip away: the set and its songs,
  // then the participants' knowledge (which needs the collaborator list).
  it("reads in two round trips", async () => {
    const start = Date.now();
    await render();
    expect(Date.now() - start).toBeLessThan(DELAY * 2.5);
  });
});
