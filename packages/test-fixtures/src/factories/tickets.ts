import { EMAIL_DOMAIN } from "../constants";
import type { FixtureContext } from "../context";
import type { EventAttendanceRow, JamRow, OrderStatus, TicketOrderRow, TicketRow, TicketTypeRow } from "../types";

export function buildTicketTypes(ctx: FixtureContext, jam: JamRow): TicketTypeRow[] {
  return [
    { name: "General admission", description: "Lyrics and chords provided", price_cents: 1500, quantity: null },
    { name: "Under 12", description: "Kids sing free", price_cents: 0, quantity: 30 },
  ].map((spec, sort_order) => ({ id: ctx.id("ticket-type", `${jam.id}:${spec.name}`), jam_id: jam.id, sort_order, ...spec }));
}

// Stripe's standard 2.9% + 30¢, which the ticket manager uses to show net revenue.
function stripeFee(amountCents: number): number {
  return amountCents === 0 ? 0 : Math.round(amountCents * 0.029) + 30;
}

export type Buyer = { userId: string | null; name: string; email: string };

export function guestBuyer(key: string, name: string): Buyer {
  return { userId: null, name, email: `${key}@${EMAIL_DOMAIN}` };
}

export function buildOrder(
  ctx: FixtureContext,
  jam: JamRow,
  buyer: Buyer,
  lines: { type: TicketTypeRow; quantity: number }[],
  status: OrderStatus = "paid",
): { order: TicketOrderRow; tickets: TicketRow[] } {
  const key = `${jam.id}:${buyer.email}`;
  const id = ctx.id("order", key);
  const amount = lines.reduce((sum, line) => sum + line.type.price_cents * line.quantity, 0);
  const createdAt = new Date(new Date(jam.created_at).getTime() + ctx.rng.int(1, 14) * 86_400_000).toISOString();
  const paid = status === "paid" || status === "refunded";
  const code = ctx.shortCode("order", key);

  const order: TicketOrderRow = {
    id,
    jam_id: jam.id,
    buyer_user_id: buyer.userId,
    buyer_email: buyer.email,
    buyer_name: buyer.name,
    status,
    amount_cents: amount,
    stripe_fee_cents: paid ? stripeFee(amount) : null,
    stripe_checkout_session_id: `cs_test_fixture_${code}`,
    stripe_payment_intent_id: paid && amount > 0 ? `pi_test_fixture_${code}` : null,
    expires_at: new Date(new Date(createdAt).getTime() + 30 * 60_000).toISOString(),
    paid_at: paid ? createdAt : null,
    created_at: createdAt,
  };

  const tickets: TicketRow[] = [];
  for (const line of lines) {
    for (let i = 0; i < line.quantity; i++) {
      const first = tickets.length === 0;
      tickets.push({
        id: ctx.id("ticket", `${key}:${line.type.id}:${i}`),
        order_id: id,
        ticket_type_id: line.type.id,
        jam_id: jam.id,
        holder_user_id: first ? buyer.userId : null,
        holder_name: first ? buyer.name : `${buyer.name}'s guest ${tickets.length}`,
        holder_email: buyer.email,
        checked_in_at: null,
      });
    }
  }
  return { order, tickets };
}

// Check-ins for a past event: every ticket was scanned at the door. Attendance is recorded once
// per email per event (event_attendance is unique on jam_id, email), so a buyer's guests count
// under the buyer.
export function buildCheckIns(ctx: FixtureContext, jam: JamRow, tickets: TicketRow[]): EventAttendanceRow[] {
  const checkedInAt = jam.starts_at;
  const byEmail = new Map<string, EventAttendanceRow>();
  for (const ticket of tickets) {
    ticket.checked_in_at = checkedInAt;
    const email = ticket.holder_email.toLowerCase();
    if (byEmail.has(email)) continue;
    byEmail.set(email, {
      id: ctx.id("attendance", `${jam.id}:${email}`),
      jam_id: jam.id,
      email,
      user_id: ticket.holder_user_id,
      name: ticket.holder_name,
      source: "checkin",
      created_at: checkedInAt,
    });
  }
  return [...byEmail.values()];
}
