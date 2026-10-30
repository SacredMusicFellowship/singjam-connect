type CapacityJam = { capacity: number | null; host_user_id: string | null; visibility: string | null };

// A jam's capacity is everyone in the room, host included: a host who sets 9
// for their living room means nine people, not nine guests plus themselves.
// Hosts have no RSVP row, so callers count attending RSVPs *excluding* the host
// and this adds the host's seat back exactly once. Official events belong to
// SingJam rather than to whoever created them, so no host seat is taken there —
// the same rule the attendee list uses when it shows who's going.
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
