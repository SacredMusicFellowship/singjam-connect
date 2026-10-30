import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canManageJam } from "@/lib/jamAuthz";

// Ticket tiers for a jam. Reads are open to anyone who can see the jam; writes
// are host or co-host only. Authorization runs here with the admin client rather
// than through RLS, matching how set-list permissions already work in this repo.

async function getUser(req: Request) {
  const supabase = await supabaseServer();
  let user = (await supabase.auth.getUser()).data.user ?? null;
  if (!user) {
    const bearer = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (bearer) user = (await supabaseFromBearer(bearer).auth.getUser()).data.user ?? null;
  }
  return user;
}

async function canManage(jamId: string, userId: string) {
  const admin = supabaseAdmin();
  const { data: jam } = await admin.from("jams").select("id").eq("id", jamId).maybeSingle();
  if (!jam) return { ok: false as const, status: 404 };

  // Official events belong to the org, so anyone who can host one can run any
  // of them — not only whoever created it. See lib/jamAuthz.ts.
  return (await canManageJam(admin, jamId, userId))
    ? { ok: true as const }
    : { ok: false as const, status: 403 };
}

// Sales windows. The table has a check constraint that an end must follow its
// start, but a violated constraint reaches the host as a raw Postgres string —
// so the same rule is stated here, where it can be a sentence. A null on either
// side means "no limit" and is always valid.
function windowError(start: unknown, end: unknown): string | null {
  for (const [label, v] of [["start", start], ["end", end]] as const) {
    if (v == null) continue;
    if (typeof v !== "string" || Number.isNaN(new Date(v).getTime())) {
      return `Sales ${label} isn't a valid date and time`;
    }
  }
  if (typeof start !== "string" || typeof end !== "string") return null;
  return new Date(end) > new Date(start) ? null : "Sales must end after they start";
}

// Availability uses the same function the reservation path uses, so what a buyer
// is offered matches what the oversell guard will actually allow.
//
// "sold" and "held" are reported separately. The availability count includes
// live holds — a checkout in progress must reserve its stock — but a hold is not
// a sale, and labelling it as one showed hosts revenue they hadn't earned.
//
// The event-wide limit (jams.ticket_limit) is totalled from the same per-tier
// counts — every ticket belongs to exactly one of the event's tiers — and each
// tier's remaining is clamped to it, as jam_ticket_tiers does for listings.
async function withAvailability(jamId: string) {
  const admin = supabaseAdmin();
  const [{ data: types }, { data: jam }] = await Promise.all([
    admin
      .from("ticket_types")
      .select("id, name, description, price_cents, currency, quantity, sales_start_at, sales_end_at, sort_order")
      .eq("jam_id", jamId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    admin.from("jams").select("ticket_limit").eq("id", jamId).maybeSingle(),
  ]);

  const rows = types ?? [];
  const [counted, paid] = await Promise.all([
    Promise.all(rows.map((t) => admin.rpc("ticket_type_sold_count", { type_id: t.id }))),
    Promise.all(rows.map((t) => admin.rpc("ticket_type_paid_count", { type_id: t.id }))),
  ]);

  const againstStock = rows.map((_, i) => (counted[i].data as number) ?? 0);
  const soldCounts = rows.map((_, i) => (paid[i].data as number) ?? 0);
  const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

  const limit: number | null = jam?.ticket_limit ?? null;
  const ticketLimit =
    limit === null
      ? null
      : {
          quantity: limit,
          sold: sum(soldCounts),
          held: Math.max(0, sum(againstStock) - sum(soldCounts)),
          remaining: Math.max(0, limit - sum(againstStock)),
        };

  const now = Date.now();
  const ticketTypes = rows.map((t, i) => {
    const heldCount = Math.max(0, againstStock[i] - soldCounts[i]);
    const tierRemaining = t.quantity === null ? null : Math.max(0, t.quantity - againstStock[i]);
    const remaining =
      ticketLimit === null
        ? tierRemaining
        : Math.min(tierRemaining ?? Infinity, ticketLimit.remaining);
    const notYetOpen = t.sales_start_at ? now < new Date(t.sales_start_at).getTime() : false;
    const closed = t.sales_end_at ? now > new Date(t.sales_end_at).getTime() : false;
    return {
      ...t,
      sold: soldCounts[i],
      held: heldCount,
      remaining,
      on_sale: !notYetOpen && !closed && remaining !== 0,
      not_yet_open: notYetOpen,
      closed,
    };
  });

  return { ticket_types: ticketTypes, ticket_limit: ticketLimit };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jamId } = await params;

  // Readable by anyone who can read the jam — let the jams RLS policy decide
  // rather than restating the visibility rules here.
  const supabase = await supabaseServer();
  const { data: jam } = await supabase.from("jams").select("id").eq("id", jamId).maybeSingle();
  if (!jam) return NextResponse.json({ error: "Jam not found" }, { status: 404 });

  return NextResponse.json(await withAvailability(jamId));
}

// The event-wide limit. Body: { ticket_limit: number | null } — null removes it.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jamId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const auth = await canManage(jamId, user.id);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 404 ? "Jam not found" : "Only the host can manage tickets" },
      { status: auth.status }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const limit = body?.ticket_limit ?? null;
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
    return NextResponse.json({ error: "Total tickets must be a positive whole number" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Same rule as a tier's cap: never below what is already sold or held.
  if (limit !== null) {
    const { data: sold } = await admin.rpc("jam_ticket_sold_count", { jam_id_param: jamId });
    if ((sold as number) > limit) {
      return NextResponse.json(
        { error: `${sold} already sold — total cannot go below that` },
        { status: 409 }
      );
    }
  }

  const { error } = await admin.from("jams").update({ ticket_limit: limit }).eq("id", jamId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jamId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const auth = await canManage(jamId, user.id);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 404 ? "Jam not found" : "Only the host can manage tickets" },
      { status: auth.status }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const priceCents = Number(body?.price_cents);

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    return NextResponse.json({ error: "Price must be a whole number of cents" }, { status: 400 });
  }
  if (body?.quantity != null && (!Number.isInteger(body.quantity) || body.quantity < 1)) {
    return NextResponse.json({ error: "Quantity must be a positive whole number" }, { status: 400 });
  }

  const badWindow = windowError(body?.sales_start_at || null, body?.sales_end_at || null);
  if (badWindow) return NextResponse.json({ error: badWindow }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("ticket_types")
    .insert({
      jam_id: jamId,
      name,
      description: body?.description?.trim() || null,
      price_cents: priceCents,
      quantity: body?.quantity ?? null,
      sales_start_at: body?.sales_start_at || null,
      sales_end_at: body?.sales_end_at || null,
      sort_order: Number.isInteger(body?.sort_order) ? body.sort_order : 0,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jamId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const auth = await canManage(jamId, user.id);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 404 ? "Jam not found" : "Only the host can manage tickets" },
      { status: auth.status }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body?.id) return NextResponse.json({ error: "Ticket type id required" }, { status: 400 });

  const admin = supabaseAdmin();

  // Dropping capacity below what is already sold would silently invalidate
  // tickets people have paid for, so refuse rather than accept it.
  if (body.quantity != null) {
    const { data: sold } = await admin.rpc("ticket_type_sold_count", { type_id: body.id });
    if ((sold as number) > body.quantity) {
      return NextResponse.json(
        { error: `${sold} already sold — capacity cannot go below that` },
        { status: 409 }
      );
    }
  }

  const patch: Record<string, unknown> = {};
  for (const f of ["name", "description", "price_cents", "quantity", "sales_start_at", "sales_end_at", "sort_order"]) {
    if (f in body) patch[f] = body[f];
  }

  if (typeof patch.name === "string") {
    patch.name = patch.name.trim();
    if (!patch.name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if ("price_cents" in patch && (!Number.isInteger(patch.price_cents) || (patch.price_cents as number) < 0)) {
    return NextResponse.json({ error: "Price must be a whole number of cents" }, { status: 400 });
  }

  // A partial update has to be checked against what the row already holds:
  // moving only the start can still put it past a stored end.
  if ("sales_start_at" in patch || "sales_end_at" in patch) {
    const { data: current } = await admin
      .from("ticket_types")
      .select("sales_start_at, sales_end_at")
      .eq("id", body.id)
      .eq("jam_id", jamId)
      .maybeSingle();
    const effective = { ...(current ?? {}), ...patch } as Record<string, unknown>;
    const badWindow = windowError(effective.sales_start_at ?? null, effective.sales_end_at ?? null);
    if (badWindow) return NextResponse.json({ error: badWindow }, { status: 400 });
  }

  const { error } = await admin
    .from("ticket_types")
    .update(patch)
    .eq("id", body.id)
    .eq("jam_id", jamId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jamId } = await params;
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const auth = await canManage(jamId, user.id);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 404 ? "Jam not found" : "Only the host can manage tickets" },
      { status: auth.status }
    );
  }

  const typeId = new URL(req.url).searchParams.get("type_id");
  if (!typeId) return NextResponse.json({ error: "type_id required" }, { status: 400 });

  const admin = supabaseAdmin();

  // tickets.ticket_type_id is ON DELETE RESTRICT, so Postgres would reject this
  // anyway — but a clear message beats a foreign-key error surfacing in the UI.
  const { data: sold } = await admin.rpc("ticket_type_sold_count", { type_id: typeId });
  if ((sold as number) > 0) {
    return NextResponse.json(
      { error: `${sold} ticket(s) sold — close sales instead of deleting` },
      { status: 409 }
    );
  }

  const { error } = await admin.from("ticket_types").delete().eq("id", typeId).eq("jam_id", jamId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
