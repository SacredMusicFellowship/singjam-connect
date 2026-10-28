import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("next/link", () => ({ default: (p: any) => p.children }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ stripe: vi.fn(), TICKET_PM_CONFIG: null, EXCLUDED_PAYMENT_METHODS: [] }));
vi.mock("@/components/TicketPaymentPanel", () => ({ default: () => null }));

import TicketPaymentPage from "./page";

const text = (node: any): string =>
  node == null || typeof node === "boolean"
    ? ""
    : typeof node === "string" || typeof node === "number"
    ? String(node)
    : Array.isArray(node)
    ? node.map(text).join("")
    : typeof node.type === "function"
    ? text(node.type(node.props))
    : text(node.props?.children);

const render = (searchParams: Record<string, string>) =>
  TicketPaymentPage({ params: Promise.resolve({ id: "jam-1" }), searchParams: Promise.resolve(searchParams) });

afterEach(() => vi.unstubAllEnvs());

describe("expired-hold screen, shown by link under next dev", () => {
  it("renders the screen with its Back to tickets button", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const page = text(await render({ show: "expired" }));
    expect(page).toContain("This hold expired");
    expect(page).toContain("Back to tickets");
  });

  it("is ignored outside next dev", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(render({ show: "expired" })).rejects.toThrow("redirect:/jam/jam-1");
  });
});
