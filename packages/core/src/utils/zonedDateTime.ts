/**
 * Converting between an `<input type="datetime-local">` value and a UTC
 * instant, in a named timezone rather than the browser's own.
 *
 * A ticket sales window is quoted in the timezone of the venue — "advance
 * sales end Oct 3 at 11:59pm" means 11:59pm in Berkeley, whoever is typing it.
 * `new Date("2026-10-03T23:59")` resolves in the *runtime's* zone, so a host
 * setting that window from another city would close sales at the wrong hour,
 * and doing it on the server would close them in UTC.
 */

const INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Minutes the zone is ahead of UTC at a given instant. Read back out of Intl
 * rather than tabulated, so DST comes from the platform's own tz database.
 */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const at = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);

  const wallClock = Date.UTC(
    at("year"),
    at("month") - 1,
    at("day"),
    // h23 should never yield 24, but an older ICU can; it means midnight.
    at("hour") % 24,
    at("minute"),
    at("second")
  );
  return (wallClock - instant.getTime()) / 60000;
}

/**
 * Reads a `datetime-local` value as a wall clock in `timeZone` and returns the
 * instant it names, as an ISO string. Returns null for a blank or malformed
 * value, so a cleared input round-trips to a null column.
 *
 * `seconds` is for an *inclusive* end time: an input of 23:59 with seconds 59
 * closes sales at 23:59:59, which is what "through 11:59pm" means and what
 * stops a minute of dead air before the next tier opens.
 */
export function zonedInputToIso(
  value: string | null | undefined,
  timeZone: string,
  seconds = 0
): string | null {
  const m = INPUT.exec((value ?? "").trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;

  const asIfUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, seconds);
  // Correct the guess by the offset in force at it, then again at the corrected
  // instant: a window set near a DST transition can land on the other side of
  // it, where the offset differs from the one we first measured.
  let ts = asIfUtc - offsetMinutes(new Date(asIfUtc), timeZone) * 60000;
  ts = asIfUtc - offsetMinutes(new Date(ts), timeZone) * 60000;
  return new Date(ts).toISOString();
}

/**
 * The inverse: an instant, as the `datetime-local` value a host should see for
 * it in `timeZone`. Seconds are dropped — the input has minute precision, and
 * re-saving restores them through `zonedInputToIso`'s `seconds`.
 */
export function isoToZonedInput(
  iso: string | null | undefined,
  timeZone: string
): string {
  if (!iso) return "";
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);

  const at = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const hour = String(Number(at("hour")) % 24).padStart(2, "0");

  return `${at("year")}-${at("month")}-${at("day")}T${hour}:${at("minute")}`;
}

/**
 * The zone's short name at a given instant ("PDT"), for labelling the inputs.
 * Hosts type a wall-clock time; this is what tells them which wall clock.
 */
export function zoneAbbreviation(timeZone: string, at: Date = new Date()): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}

/** Whether `tz` is an IANA zone this runtime can format in ("America/New_York"). */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Native date/time pickers hand back Dates in the device's zone. These carry an
 * event's wall clock through them: the picker shows the venue's time because the
 * Date's *local* fields hold it, whatever zone the device is in.
 */
export function pickersToZonedInput(date: Date, time: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(time.getHours())}:${pad(time.getMinutes())}`;
}

export function zonedInputToPickerDate(value: string): Date | null {
  const m = INPUT.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return new Date(+y, +mo - 1, +d, +h, +mi);
}
