import { dropUsCountry, dropVenueRepeatedInTitle } from "./formatVenueAddress";

// The when and where of an event as plain server-side text, for link previews,
// where the image alone may have been cropped past the flyer's own details.
// Formatted in the event's own zone: the server runs in UTC.

/** "Sunday, November 1, 2026" */
export function formatJamLongDate(startsAt: string | null | undefined, timezone?: string | null): string | null {
  if (!startsAt) return null;
  return new Date(startsAt).toLocaleDateString("en-US", {
    timeZone: timezone ?? undefined,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** "2:30 PM – 4:30 PM PST", or "2:30 PM PST" with no end time. The zone is named once, on the last time. */
export function formatJamTimeRange(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
  timezone?: string | null
): string | null {
  if (!startsAt) return null;
  const time = { timeZone: timezone ?? undefined, hour: "numeric", minute: "2-digit" } as const;
  const zoned = { ...time, timeZoneName: "short" } as const;
  if (!endsAt) return new Date(startsAt).toLocaleTimeString("en-US", zoned);
  return `${new Date(startsAt).toLocaleTimeString("en-US", time)} – ${new Date(endsAt).toLocaleTimeString("en-US", zoned)}`;
}

/**
 * Where an event is, as much as anyone holding the link may see: a community
 * jam only shows its neighbourhood until you RSVP, while an official event is
 * public and a private jam's link is itself the invitation.
 */
export function jamPreviewPlace(jam: {
  name: string | null;
  visibility: string;
  neighborhood: string | null;
  full_address: string | null;
}): string | null {
  const tbd = (jam.neighborhood === "TBD" && !jam.full_address) || jam.full_address === "TBD";
  if (tbd) return "Location TBD";
  if (jam.visibility !== "community" && jam.full_address) {
    return dropUsCountry(dropVenueRepeatedInTitle(jam.full_address, jam.name));
  }
  return jam.neighborhood;
}
