import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { FormattedDate, FormattedTime } from "@/components/FormattedTime";
import { googleMapsUrl } from "@singjam/core";
import AddToCalendarButton from "@/components/AddToCalendarButton";

export type JamCardData = {
  id?: string | null;
  name: string | null;
  visibility: "official" | "community" | "private";
  starts_at: string | null;
  ends_at: string | null;
  timezone?: string | null;
  neighborhood: string | null;
  full_address: string | null;
  notes: string | null;
  tickets_url: string | null;
  image_url: string | null;
  image_focal_point?: string | null;
  genres: string[];
  themes: string[];
  host?: string | null;
  hostUsername?: string | null;
  capacity?: number | null;
  hasFullAccess: boolean;
};


// How much of the address this viewer gets, and what to point the map at.
// Shared with JamMap below, which renders further down the page than this card
// and would otherwise have to restate the rules.
function locationView(jam: JamCardData) {
  const isTbd = (jam.neighborhood === "TBD" && !jam.full_address) || jam.full_address === "TBD";
  const showFullAddress =
    (jam.hasFullAccess || jam.visibility === "private") && !!jam.full_address && !isTbd;
  return {
    showFullAddress,
    mapQuery: isTbd ? null : showFullAddress ? jam.full_address! : jam.neighborhood,
    mapZoom: showFullAddress ? 16 : 13,
  };
}

/**
 * The venue map. Lifted out of this card so JamView can render it at the very
 * bottom of the event page, below everything else, on every jam type. The
 * New/Edit jam previews still show it inside the card.
 */
export function JamMap({ jam, className = "h-[260px]" }: { jam: JamCardData; className?: string }) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const { mapQuery, mapZoom } = locationView(jam);
  if (!key || !mapQuery) return null;

  const src = `https://www.google.com/maps/embed/v1/place?key=${key}&q=${encodeURIComponent(
    mapQuery
  )}&zoom=${mapZoom}`;
  return (
    <div className={`overflow-hidden rounded-2xl border border-zinc-200 ${className}`}>
      <iframe
        src={src}
        title="Venue map"
        width="100%"
        height="100%"
        style={{ border: 0 }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}

/**
 * The event description. Lives in the card normally, but on a ticketed event
 * JamView renders it *below* the ticket panel — Sherri asked for the tickets
 * either side of it and Ben picked above, which puts the price list in the
 * first screenful and leaves the detail for whoever wants it.
 */
export function JamDescription({
  jam,
  className = "",
}: {
  jam: JamCardData;
  className?: string;
}) {
  if (!jam.notes) return null;
  return (
    <div className={`space-y-2 ${className}`}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">About</h2>
      <p className="text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">{jam.notes}</p>
    </div>
  );
}

/**
 * The venue line. A link when we have somewhere to point at, plain text
 * otherwise (a TBD venue), so the styling is identical either way and only the
 * affordance appears.
 */
function LocationText({ query, children }: { query: string | null; children: ReactNode }) {
  // The <p> stays put in both branches and the anchor goes *inside* it. Making
  // the anchor itself the block element shifted every non-ticketed page down a
  // couple of pixels (an inline box lays out differently from a block one), and
  // a block anchor would also make the whole row width clickable rather than
  // just the address.
  return (
    <p className="text-sm font-medium text-zinc-800">
      {query ? (
        <a
          href={query}
          target="_blank"
          rel="noopener noreferrer"
          // Opens a new tab, which a screen reader has no other way to know.
          aria-label={`Open ${typeof children === "string" ? children : "this location"} in Google Maps (new tab)`}
          className="hover:underline"
        >
          {children}
        </a>
      ) : (
        children
      )}
    </p>
  );
}

export default function JamCard({
  jam,
  actions,
  sellsTickets = false,
  ticketPanelFollows = false,
  showMap = true,
}: {
  jam: JamCardData;
  actions?: ReactNode;
  /**
   * The event sells tickets, by our own tiers or an external link. Such an
   * event hides "Add to calendar": you should not be blocking out an evening
   * you have not got a ticket for yet, and on a ticketed page the button was
   * the only thing above the tier list, which read as the primary action.
   */
  sellsTickets?: boolean;
  /**
   * A ticket panel renders directly after this card, so the description moves
   * out to sit below it. Everything else keeps it here, inside the card, on the
   * card's own spacing.
   */
  ticketPanelFollows?: boolean;
  /**
   * False on the event page, which renders the map itself at the very bottom
   * on every jam type. The New/Edit jam previews keep it inside the card.
   */
  showMap?: boolean;
}) {
  const isOfficial = jam.visibility === "official";
  const tags = [...jam.genres, ...jam.themes];

  const { showFullAddress, mapQuery } = locationView(jam);
  const mapsUrl = googleMapsUrl(mapQuery);
  const showCalendar = !!jam.starts_at && !sellsTickets;

  return (
    <div>
      {/* Hero image */}
      {jam.image_url && (
        <div
          className="relative mb-6 overflow-hidden rounded-2xl bg-black"
          style={{ height: 320, "--focal-point": jam.image_focal_point ?? "50% 50%" } as CSSProperties}
        >
          <Image
            src={jam.image_url}
            alt={jam.name ?? "Event"}
            fill
            className="object-contain sm:object-cover sm:object-[var(--focal-point)]"
            sizes="(max-width: 896px) 100vw, 896px"
            priority
          />
        </div>
      )}

      <div className="space-y-6">
        {/* Header */}
        <div>
          {isOfficial && (
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-amber-500">
              Official SingJam event
            </p>
          )}
          {jam.visibility === "community" && (
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-sky-500">
              Public jam
            </p>
          )}
          {jam.visibility === "private" && (
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-violet-500">
              Private jam
            </p>
          )}
          <h1 className="text-2xl font-bold text-zinc-900 leading-tight">
            {jam.name ?? (isOfficial ? "SingJam event" : "Community jam")}
          </h1>
          {isOfficial ? (
            <p className="mt-1 text-sm text-zinc-500">
              Hosted by <span className="font-medium text-zinc-700">SingJam</span>
            </p>
          ) : jam.host && (
            <p className="mt-1 text-sm text-zinc-500">
              Hosted by{" "}
              {jam.hostUsername ? (
                <Link href={`/u/${jam.hostUsername}`} className="font-medium text-zinc-700 hover:underline">
                  {jam.host}
                  <span className="ml-1 font-normal text-zinc-400">@{jam.hostUsername}</span>
                </Link>
              ) : (
                <span className="font-medium text-zinc-700">{jam.host}</span>
              )}
            </p>
          )}
        </div>

        {/* Date / time / location strip */}
        <div className="rounded-2xl border border-zinc-200 bg-white divide-y divide-zinc-100">
          {jam.starts_at && (
            <div className="flex items-start gap-4 px-5 py-4">
              <div className="shrink-0 w-10 text-center">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  <FormattedDate iso={jam.starts_at} timezone={jam.timezone} options={{ weekday: "short" }} />
                </div>
                <div className="text-2xl font-bold text-zinc-900 leading-none">
                  <FormattedDate iso={jam.starts_at} timezone={jam.timezone} options={{ day: "numeric" }} />
                </div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  <FormattedDate iso={jam.starts_at} timezone={jam.timezone} options={{ month: "short" }} />
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-800">
                  <FormattedDate iso={jam.starts_at} timezone={jam.timezone} options={{ weekday: "long", month: "long", day: "numeric", year: "numeric" }} />
                </p>
                <p className="text-sm text-zinc-500">
                  <FormattedTime iso={jam.starts_at} timezone={jam.timezone} />
                  {jam.ends_at && <> – <FormattedTime iso={jam.ends_at} timezone={jam.timezone} /></>}
                </p>
              </div>
            </div>
          )}

          {(jam.neighborhood || jam.full_address) && (
            <div className="flex items-start gap-4 px-5 py-4">
              <div className="shrink-0 w-10 flex justify-center pt-0.5">
                <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
              </div>
              <div className="min-w-0">
                {/* The location links out to Maps. Pointed at the same mapQuery
                    the embed uses, so the link and the map can never disagree —
                    and so a jam that only reveals its address after RSVP links
                    to the neighbourhood, not the street. Null for a TBD venue,
                    which falls back to plain text. */}
                <LocationText query={mapsUrl}>
                  {showFullAddress ? jam.full_address : jam.neighborhood}
                </LocationText>
                {!showFullAddress && !isOfficial && jam.neighborhood !== "TBD" && (
                  <p className="text-xs text-zinc-400 mt-0.5">Full address shown after RSVP</p>
                )}
              </div>
            </div>
          )}

          {jam.capacity != null && (
            <div className="flex items-start gap-4 px-5 py-4">
              <div className="shrink-0 w-10 flex justify-center pt-0.5">
                <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-zinc-800">{jam.capacity} spots</p>
            </div>
          )}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600">
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        {(jam.tickets_url || showCalendar || actions) && (
          <div className="flex flex-wrap gap-3 items-center">
            {jam.tickets_url && (
              <a
                href={jam.tickets_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 transition-colors"
              >
                Get tickets ↗
              </a>
            )}
            {jam.starts_at && !sellsTickets && (
              <AddToCalendarButton
                title={jam.name ?? (isOfficial ? "SingJam event" : "Community jam")}
                startsAt={jam.starts_at}
                endsAt={jam.ends_at}
                location={showFullAddress ? jam.full_address : jam.neighborhood}
                description={jam.notes}
                jamId={jam.id ?? undefined}
              />
            )}
            {actions}
          </div>
        )}

        {/* On a ticketed event the description moves out to sit below the
            ticket panel, and JamView places it. */}
        {!ticketPanelFollows && <JamDescription jam={jam} />}
        {showMap && <JamMap jam={jam} />}
      </div>
    </div>
  );
}
