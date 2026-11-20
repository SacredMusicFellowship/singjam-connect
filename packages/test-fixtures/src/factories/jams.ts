import { TIMEZONE } from "../constants";
import { TAGS, type TagName } from "../names";
import type { FixtureContext } from "../context";
import type { InviteStatus, JamTagRow, JamInviteRow, JamRow, JamRsvpRow, JamVisibility } from "../types";

export type JamOptions = {
  key: string;
  name: string;
  hostUserId: string;
  visibility: JamVisibility;
  startsInDays: number;
  startHour: number;
  durationHours: number;
  neighborhood: string;
  fullAddress: string;
  notes: string;
  capacity?: number | null;
  ticketLimit?: number | null;
  guestsCanInvite?: boolean;
  genres?: readonly TagName[];
};

export function buildJam(ctx: FixtureContext, options: JamOptions): { jam: JamRow; tags: JamTagRow[] } {
  const id = ctx.id("jam", options.key);
  const startsAt = ctx.at(options.startsInDays, options.startHour);
  const endsAt = new Date(new Date(startsAt).getTime() + options.durationHours * 3_600_000).toISOString();
  return {
    jam: {
      id,
      short_code: ctx.shortCode("jam", options.key),
      name: options.name,
      host_user_id: options.hostUserId,
      visibility: options.visibility,
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: TIMEZONE,
      neighborhood: options.neighborhood,
      full_address: options.fullAddress,
      notes: options.notes,
      capacity: options.capacity ?? null,
      ticket_limit: options.ticketLimit ?? null,
      guests_can_invite: options.guestsCanInvite ?? false,
      // Official events show the SingJam placeholder poster rather than a photo.
      image_url: null,
      created_at: ctx.at(Math.min(options.startsInDays, 0) - 21),
    },
    tags: (options.genres ?? []).map((name) => ({ jam_id: id, tag_type: TAGS[name], tag_name: name })),
  };
}

// RSVPs for `userIds` in order. Once `capacity` is reached, the rest go on the waitlist, the way
// the app fills a jam.
export function buildRsvps(ctx: FixtureContext, jam: JamRow, userIds: readonly string[]): JamRsvpRow[] {
  let waitlisted = 0;
  return userIds.map((userId, index) => {
    const full = jam.capacity !== null && index >= jam.capacity;
    return {
      id: ctx.id("rsvp", `${jam.id}:${userId}`),
      jam_id: jam.id,
      user_id: userId,
      status: full ? "waitlist" : "attending",
      waitlist_position: full ? ++waitlisted : null,
      created_at: new Date(new Date(jam.created_at).getTime() + (index + 1) * 3_600_000).toISOString(),
    };
  });
}

export function buildInvite(
  ctx: FixtureContext,
  jam: JamRow,
  invitedUserId: string,
  status: InviteStatus,
): JamInviteRow {
  return {
    id: ctx.id("invite", `${jam.id}:${invitedUserId}`),
    jam_id: jam.id,
    invited_user_id: invitedUserId,
    invited_by: jam.host_user_id,
    status,
    created_at: new Date(new Date(jam.created_at).getTime() + 86_400_000).toISOString(),
  };
}
