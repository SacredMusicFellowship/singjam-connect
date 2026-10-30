type CapacityJam = { capacity: number | null; host_user_id: string | null; visibility: string | null };

// The RSVP row callers must leave out of their attending count: the host's,
// because jamSeatsTaken adds that seat itself. Null on an official event —
// no host seat is added there, so whoever created it is an ordinary attendee
// and their RSVP must count, or every official headcount comes up one short.
export function jamSeatExcludedUserId(jam: Omit<CapacityJam, "capacity">): string | null {
  return jam.visibility === "official" ? null : jam.host_user_id;
}

// A jam's capacity is everyone in the room, host included: a host who sets 9
// for their living room means nine people, not nine guests plus themselves.
// Hosts have no RSVP row, so callers count attending RSVPs excluding
// jamSeatExcludedUserId and this adds the host's seat back exactly once.
// Official events belong to SingJam rather than to whoever created them, so no
// host seat is taken there — the same rule the attendee list uses.
export function jamSeatsTaken(
  jam: Omit<CapacityJam, "capacity">,
  attendingExcludingHost: number,
): number {
  const hostSeat = jam.host_user_id && jam.visibility !== "official" ? 1 : 0;
  return attendingExcludingHost + hostSeat;
}

export function jamIsFull(jam: CapacityJam, attendingExcludingHost: number): boolean {
  return jam.capacity !== null && jamSeatsTaken(jam, attendingExcludingHost) >= jam.capacity;
}
