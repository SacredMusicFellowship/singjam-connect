import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { writes, mockRetrieve } = vi.hoisted(() => ({ writes: [] as string[], mockRetrieve: vi.fn() }));

const TYPES = [{ id: "adv", name: "Advance", price_cents: 1500, currency: "usd" }];

function chain(table: string) {
  const c: any = {};
  for (const m of ["select", "eq", "in"]) c[m] = vi.fn(() => c);
  for (const m of ["insert", "update", "upsert", "delete"]) c[m] = vi.fn(() => { writes.push(`${table}.${m}`); return c; });
  const result = table === "jams" ? { data: { name: "Winter Sing" } } : { data: table === "ticket_types" ? TYPES : [] };
  c.maybeSingle = () => Promise.resolve(result);
  c.then = (res: any) => Promise.resolve(result).then(res);
  return c;
}

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({ from: (t: string) => chain(t), rpc: vi.fn(() => { writes.push("rpc"); }) }),
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock("@/lib/stripe", () => ({ stripe: () => ({ checkout: { sessions: { retrieve: mockRetrieve } } }) }));
vi.mock("@/lib/setWithSongs", () => ({ findSetWithSongs: async () => ({ id: "set-1" }) }));
vi.mock("@/lib/promoCode", () => ({ resolvePromoCode: vi.fn() }));
vi.mock("@/components/TicketConfirmationPoller", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: (p: any) => p.children }));

import TicketsCompletePage from "./page";

const text = (node: any): string =>
  node == null || typeof node === "boolean"
    ? ""
    : typeof node === "string" || typeof node === "number"
    ? String(node)
    : Array.isArray(node)
    ? node.map(text).join("")
    : text(node.props?.children);

beforeEach(() => {
  writes.length = 0;
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

const render = (searchParams: Record<string, string>) =>
  TicketsCompletePage({ params: Promise.resolve({ id: "jam-1" }), searchParams: Promise.resolve(searchParams) });

describe("ticket confirmation preview", () => {
  it("shows the paid confirmation, labelled as a preview, without writing anything", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const page = text(await render({ preview: "adv:2", cover: "1" }));
    expect(page).toContain("Preview — no ticket was reserved, nothing was charged or emailed.");
    expect(page).toContain("You're in!");
    expect(page).toContain("2 tickets");
    expect(page).toContain("See what we're singing");
    expect(writes).toEqual([]);
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it("ignores the preview outside next dev", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const page = text(await render({ preview: "adv:2" }));
    expect(page).not.toContain("Preview");
    expect(page).toContain("Order not found");
  });

  it.each([
    ["paid", "You're in!"],
    ["pending", "Confirming your payment…"],
    ["failed", "Payment didn't complete"],
    ["refunded", "This order was refunded"],
    ["missing", "Order not found"],
  ])("shows the %s state by link under next dev, labelled and without writing", async (show, heading) => {
    vi.stubEnv("NODE_ENV", "development");
    const page = text(await render({ show }));
    expect(page).toContain("Preview — no ticket was reserved, nothing was charged or emailed.");
    expect(page).toContain(heading);
    expect(writes).toEqual([]);
  });

  it("shows or hides the set-list button on request", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(text(await render({ show: "paid", set: "none" }))).not.toContain("See what we're singing");
    expect(text(await render({ show: "paid", set: "some" }))).toContain("See what we're singing");
  });

  it("ignores show= outside next dev", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const page = text(await render({ show: "paid" }));
    expect(page).not.toContain("Preview");
    expect(page).toContain("Order not found");
  });
});
