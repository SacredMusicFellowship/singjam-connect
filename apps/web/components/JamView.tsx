"use client";

import { useState } from "react";
import Link from "next/link";
import JamCard, { JamDescription, JamMap, type JamCardData } from "@/components/JamCard";
import JamRsvpButton from "@/components/JamRsvpButton";
import JamInvitePanel, { type NewInviteEntry } from "@/components/JamInvitePanel";
import JamInviteResponse from "@/components/JamInviteResponse";
import JamInviteList from "@/components/JamInviteList";
import JamHostActions from "@/components/JamHostActions";
import JamAttendeeList from "@/components/JamAttendeeList";
import JamSetList from "@/components/JamSetList";
import TicketPurchasePanel from "@/components/TicketPurchasePanel";

export type InviteEntry = {
  id: string;
  invited_user_id: string | null;
  invitee_email: string | null;
  status: string;
  display_name?: string | null;
  last_name?: string | null;
  username?: string | null;
};

export type JamViewData = {
  jam: {
    name: string | null;
    capacity: number | null;
    host_user_id: string;
  };
  jamCardData: JamCardData;
  userId: string | null;
  rsvpStatus: "attending" | "waitlist" | "cancelled" | null;
  waitlistPosition: number | null;
  attendingCount: number;
  /** Ticket buyers without an account; only computed for those who can manage. */
  guestBuyerCount: number;
  pendingInvite: boolean;
  isOfficial: boolean;
  /** Whether the event has ticket tiers at all — decides where the map goes. */
  hasTicketTiers: boolean;
  isHost: boolean;
  isCoHost: boolean;
  hasFullAccess: boolean;
  canManage: boolean;
  showRsvp: boolean;
  canInvite: boolean;
  invitesEnabled: boolean;
  inviteList: InviteEntry[];
  alreadyInvitedIds: string[];
};

export default function JamView({
  jamId,
  inviteToken,
  data,
}: {
  jamId: string;
  inviteToken?: string;
  data: JamViewData;
}) {
  const {
    jam,
    jamCardData,
    userId,
    waitlistPosition,
    attendingCount,
    guestBuyerCount,
    pendingInvite,
    isOfficial,
    hasTicketTiers,
    isHost,
    isCoHost,
    canManage,
    showRsvp,
    canInvite,
    invitesEnabled,
    alreadyInvitedIds,
  } = data;

  // An official event with no on-site tiers sells through an external link, so
  // its attendance is recorded over there and this list can never fill. Worse
  // than useless: the empty state reads "No one yet — be the first", inviting
  // an RSVP that official events don't offer in the first place.
  //
  // Gated on tiers rather than on tickets_url, because those two are not
  // mutually exclusive in practice however much the copy elsewhere assumes it:
  // the 2026-07-26 event carries both. Such an event does sell here, so its
  // host still needs the door list, and keying off tickets_url would take it
  // away. Also gated on the count, so a stray row stays visible — an event
  // converted from a community jam would have real attendees on it.
  const attendanceLandsHere = !isOfficial || hasTicketTiers;
  const showAttendees = attendanceLandsHere || attendingCount > 0;

  // Whether the ticket panel renders. Drives three placements: the panel row
  // itself, the map (beside it rather than in the card), and the description
  // (below it rather than above).
  const showTicketPanel = isOfficial && hasTicketTiers;

  // Either route to a ticket counts: on our own tiers or off to someone else's
  // checkout, you still don't have one yet.
  const sellsTickets = hasTicketTiers || !!jamCardData.tickets_url;

  // Passed as undefined rather than an empty fragment when there is nothing to
  // put in it: JamCard tests this to decide whether to render the actions row
  // at all, and a fragment is truthy even when it renders nothing — which would
  // leave an empty row and its gap behind on a ticketed event, where the
  // calendar button was the row's only occupant.
  const hasActions = showRsvp || (!userId && !isOfficial);

  const [rsvpStatus, setRsvpStatus] = useState(data.rsvpStatus);
  const [hasFullAccess, setHasFullAccess] = useState(data.hasFullAccess);
  const [inviteList, setInviteList] = useState(data.inviteList);

  return (
    <div className="space-y-4">
      {pendingInvite && rsvpStatus !== "attending" && !isHost && <JamInviteResponse jamId={jamId} />}
      <JamCard
        jam={jamCardData}
        sellsTickets={sellsTickets}
        // When no panel follows — a community or private jam, or an official
        // event selling through tickets_url — the description stays inside the
        // card exactly where it has always been: there is no purchase path here
        // for it to have been in the way of. The map is rendered last on the
        // page for every jam type, below.
        ticketPanelFollows={showTicketPanel}
        showMap={false}
        actions={
          hasActions ? (
          <>
            {showRsvp && (
              <JamRsvpButton
                jamId={jamId}
                initialStatus={rsvpStatus}
                initialWaitlistPosition={waitlistPosition}
                attendingCount={attendingCount}
                capacity={jam.capacity}
                onStatusChange={(newStatus) => {
                  setRsvpStatus(newStatus);
                  setHasFullAccess(isOfficial || newStatus === "attending" || canManage);
                }}
              />
            )}
            {!userId && !isOfficial && (
              <Link
                href={`/auth?next=/jam/${jamId}${inviteToken ? `&invite=${inviteToken}` : ""}`}
                className="inline-block rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 transition-colors"
              >
                Sign in to RSVP
              </Link>
            )}
          </>
          ) : undefined
        }
      />
      {/* Official events sell tickets instead of taking RSVPs — showRsvp is
          false for them. The panel sits directly under the date/location strip
          so the tier list and its prices get the first screenful; the
          description follows it. */}
      {showTicketPanel && (
        <>
          <TicketPurchasePanel
            jamId={jamId}
            isSignedIn={!!userId}
            timezone={jamCardData.timezone}
          />
          <JamDescription jam={jamCardData} />
        </>
      )}
      {hasFullAccess && <JamSetList jamId={jamId} jamName={jam.name} canManage={canManage} />}
      {/* Official events that sell here show who's going too. Ticket buyers get
          an attending RSVP from the Stripe webhook, so the list is populated the
          same way — guests without an account are the one gap, which is what the
          sign-up nudge on the completion page is for. See showAttendees above for
          why an externally-ticketed event gets no list at all. */}
      {showAttendees && (
        <JamAttendeeList jamId={jamId} hostId={isOfficial ? null : jam.host_user_id} isHost={isHost} />
      )}
      {canInvite && invitesEnabled && (
        <JamInvitePanel
          jamId={jamId}
          alreadyInvitedIds={alreadyInvitedIds}
          onInvited={(entry: NewInviteEntry) => {
            setInviteList((prev) => [...prev, { id: crypto.randomUUID(), status: "pending", ...entry }]);
          }}
        />
      )}
      {canManage && <JamInviteList jamId={jamId} invites={inviteList} />}
      {canManage && <JamHostActions jamId={jamId} isHost={isHost} isOfficial={isOfficial} attendingCount={attendingCount + guestBuyerCount} pendingInviteCount={inviteList.filter((inv) => inv.status === "pending").length} />}
      <JamMap jam={jamCardData} />
    </div>
  );
}
