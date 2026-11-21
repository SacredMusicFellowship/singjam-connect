import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolvePromo } = vi.hoisted(() => ({ mockResolvePromo: vi.fn() }));
vi.mock("@/lib/promoCode", () => ({ resolvePromoCode: mockResolvePromo }));
vi.mock("@/lib/stripe", () => ({}));

import { buildCheckoutPreview, parsePreviewItems, previewUrl } from "./ticketCheckoutPreview";

const TYPES = [
  { id: "adv", name: "Advance", price_cents: 1500, currency: "usd" },
  { id: "door", name: "Door tickets", price_cents: 2000, currency: "usd" },
];

function adminWith(types: unknown[]) {
  const writes: string[] = [];
  const c: any = {};
  for (const m of ["select", "eq", "in"]) c[m] = vi.fn(() => c);
  for (const m of ["insert", "update", "upsert", "delete"]) c[m] = vi.fn(() => { writes.push(m); return c; });
  c.then = (res: any) => Promise.resolve({ data: types, error: null }).then(res);
  return { admin: { from: vi.fn(() => c), rpc: vi.fn() } as any, writes };
}

beforeEach(() => vi.clearAllMocks());

describe("buildCheckoutPreview", () => {
  it("adds up the selection the way the real payment page does, and writes nothing", async () => {
    const { admin, writes } = adminWith(TYPES);
    const preview = await buildCheckoutPreview(
      admin, "jam-1", "Winter Sing",
      [{ ticket_type_id: "adv", quantity: 2 }, { ticket_type_id: "door", quantity: 1 }],
      "", false,
    );
    expect(preview).toEqual({
      lines: [
        { label: "Advance ticket", quantity: 2, amountCents: 3000 },
        { label: "Door tickets", quantity: 1, amountCents: 2000 },
      ],
      discountCents: 0,
      amountCents: 5000,
      currency: "usd",
    });
    expect(writes).toEqual([]);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("applies the promo code and the processing fee on the discounted amount", async () => {
    const { admin } = adminWith(TYPES);
    mockResolvePromo.mockResolvedValue({ valid: true, discountCents: 1500, totalCents: 1500 });
    const preview: any = await buildCheckoutPreview(
      admin, "jam-1", "Winter Sing", [{ ticket_type_id: "adv", quantity: 2 }], "HALF", true,
    );
    expect(preview.discountCents).toBe(1500);
    expect(preview.lines.at(-1)).toEqual({ label: "Processing fee", quantity: 1, amountCents: 76 });
    expect(preview.amountCents).toBe(1500 + 76);
  });

  it("passes a rejected code's reason through", async () => {
    const { admin } = adminWith(TYPES);
    mockResolvePromo.mockResolvedValue({ valid: false, reason: "That code has expired" });
    expect(
      await buildCheckoutPreview(admin, "jam-1", "Winter Sing", [{ ticket_type_id: "adv", quantity: 1 }], "OLD", false)
    ).toEqual({ error: "That code has expired" });
  });

  it("refuses a tier that isn't on this event", async () => {
    const { admin } = adminWith([]);
    expect(
      await buildCheckoutPreview(admin, "jam-1", "Winter Sing", [{ ticket_type_id: "other", quantity: 1 }], "", false)
    ).toEqual({ error: "Those tickets aren't on sale" });
  });
});

describe("preview URL", () => {
  it("round-trips the selection", () => {
    const items = [{ ticket_type_id: "adv", quantity: 2 }, { ticket_type_id: "door", quantity: 1 }];
    const url = new URL(previewUrl("jam-1", "pay", items, "HALF", true), "http://localhost");
    expect(url.pathname).toBe("/jam/jam-1/tickets/pay");
    expect(parsePreviewItems(url.searchParams.get("preview")!)).toEqual(items);
    expect(url.searchParams.get("promo")).toBe("HALF");
    expect(url.searchParams.get("cover")).toBe("1");
  });
});
