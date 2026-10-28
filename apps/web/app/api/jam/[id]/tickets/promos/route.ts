import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canManageJam } from "@/lib/jamAuthz";
import { stripe } from "@/lib/stripe";
import { createPromoCode } from "@/lib/ticketPromoCodes";

// Host management of an event's promotion codes. Creation lives in
// lib/ticketPromoCodes.ts, shared with copying an event's tickets.
//
// Note the plural path: ../promo is the buyer-facing preview.

type Auth =
  | { ok: true; user: { id: string }; admin: ReturnType<typeof supabaseAdmin> }
  | { ok: false; response: NextResponse };

async function authorize(req: Request, jamId: string): Promise<Auth> {
  const supabase = await supabaseServer();
  let user = (await supabase.auth.getUser()).data.user ?? null;
  if (!user) {
    const bearer = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (bearer) user = (await supabaseFromBearer(bearer).auth.getUser()).data.user ?? null;
  }
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const admin = supabaseAdmin();
  const { data: jam } = await admin.from("jams").select("host_user_id").eq("id", jamId).maybeSingle();
  if (!jam) {
    return { ok: false, response: NextResponse.json({ error: "Jam not found" }, { status: 404 }) };
  }
  // Official events belong to the org, so anyone who can host one can run any
  // of them — not only whoever created it. See lib/jamAuthz.ts.
  if (!(await canManageJam(admin, jamId, user.id))) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Only the host can manage promo codes" }, { status: 403 }),
    };
  }
  return { ok: true, user, admin };
}

// Paid orders this code made free. Zero if it can't be counted — including
// before migration 169 adds ticket_orders.promo_code_id.
async function freeRedemptions(admin: ReturnType<typeof supabaseAdmin>, promoCodeId: string): Promise<number> {
  const { count, error } = await admin
    .from("ticket_orders")
    .select("id", { count: "exact", head: true })
    .eq("promo_code_id", promoCodeId)
    .eq("status", "paid")
    .eq("amount_cents", 0);
  return error ? 0 : count ?? 0;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jamId } = await params;
  const auth = await authorize(req, jamId);
  if (!auth.ok) return auth.response;

  const { data: rows } = await auth.admin
    .from("ticket_promo_codes")
    .select("id, code, label, stripe_promotion_code_id, created_at")
    .eq("jam_id", jamId)
    .order("created_at", { ascending: false });

  // Stripe counts the uses it charged. An order the code made free never
  // reaches Stripe (checkout fulfils it directly), so those are counted from
  // our own orders and added — the two never overlap.
  const codes = await Promise.all(
    (rows ?? []).map(async (r) => {
      const free = await freeRedemptions(auth.admin, r.id);
      let redeemed: number | null = null;
      try {
        const p = await stripe().promotionCodes.retrieve(r.stripe_promotion_code_id);
        redeemed = (p.times_redeemed ?? 0) + free;
      } catch {
        // A code deleted directly in the Dashboard shouldn't break the page.
        redeemed = free > 0 ? free : null;
      }
      return { id: r.id, code: r.code, label: r.label, redeemed };
    })
  );

  return NextResponse.json({ promo_codes: codes });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jamId } = await params;
  const auth = await authorize(req, jamId);
  if (!auth.ok) return auth.response;
  const { user, admin } = auth;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Codes are matched case-insensitively by Stripe, so normalise for storage and
  // display rather than letting "save10" and "SAVE10" look like different codes.
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
    return NextResponse.json(
      { error: "Use 3–40 letters, numbers, dashes or underscores" },
      { status: 400 }
    );
  }

  const percentOff = body?.percent_off != null ? Number(body.percent_off) : null;
  const amountOffCents = body?.amount_off_cents != null ? Number(body.amount_off_cents) : null;

  if (percentOff == null && amountOffCents == null) {
    return NextResponse.json({ error: "Set a percentage or an amount off" }, { status: 400 });
  }
  if (percentOff != null && amountOffCents != null) {
    return NextResponse.json({ error: "Set either a percentage or an amount, not both" }, { status: 400 });
  }
  if (percentOff != null && (!(percentOff > 0) || percentOff > 100)) {
    return NextResponse.json({ error: "Percentage must be between 1 and 100" }, { status: 400 });
  }
  if (amountOffCents != null && (!Number.isInteger(amountOffCents) || amountOffCents <= 0)) {
    return NextResponse.json({ error: "Amount must be a positive whole number of cents" }, { status: 400 });
  }

  const result = await createPromoCode(admin, {
    jamId,
    code,
    discount: percentOff != null ? { percentOff } : { amountOffCents: amountOffCents! },
    userId: user.id,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ...result.row, redeemed: 0 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jamId } = await params;
  const auth = await authorize(req, jamId);
  if (!auth.ok) return auth.response;
  const { admin } = auth;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: row } = await admin
    .from("ticket_promo_codes")
    .select("id, stripe_promotion_code_id, stripe_coupon_id")
    .eq("id", id)
    .eq("jam_id", jamId)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "Code not found" }, { status: 404 });

  // Deactivate rather than delete in Stripe: paid orders reference the coupon,
  // and deleting it would break their record. Deactivating stops new redemptions
  // and frees the code name for reuse.
  await stripe()
    .promotionCodes.update(row.stripe_promotion_code_id, { active: false })
    .catch(() => {});

  await admin.from("ticket_promo_codes").delete().eq("id", row.id);
  return NextResponse.json({ ok: true });
}
