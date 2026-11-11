export type AttendeeRole = "host" | "cohost" | "leader" | "going";

const ROLE_ORDER: Record<AttendeeRole, number> = { host: 0, cohost: 1, leader: 2, going: 3 };
const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** A co-host who also leads sits with the co-hosts. */
export function attendeeRole(flags: { host?: boolean; cohost?: boolean; leader?: boolean }): AttendeeRole {
  if (flags.host) return "host";
  if (flags.cohost) return "cohost";
  if (flags.leader) return "leader";
  return "going";
}

/**
 * Who's going, in display order: the host, co-hosts, then leaders (the people
 * running the event), then everyone else, guests without an account included.
 * Each group is sorted by name as displayed (first name first), so a long list
 * can be scanned for someone.
 */
export function sortAttendees<T>(people: T[], describe: (person: T) => { role: AttendeeRole; name: string }): T[] {
  return people
    .map((person, i) => ({ person, i, ...describe(person) }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || collator.compare(a.name, b.name) || a.i - b.i)
    .map((x) => x.person);
}
