"use client";

import { useState } from "react";
import Link from "next/link";
import JamCard, { JamMap, JamPoster, JamSplit, type JamCardData } from "@/components/JamCard";
import JamRsvpButton from "@/components/JamRsvpButton";
import JamInvitePanel, { type NewInviteEntry } from "@/components/JamInvitePanel";
import JamInviteResponse from "@/components/JamInviteResponse";
import JamInviteList from "@/components/JamInviteList";
import JamHostActions from "@/components/JamHostActions";
import JamAttendeeList, { JamAttendeeSummary } from "@/components/JamAttendeeList";
import JamSetList from "@/components/JamSetList";
import TicketPurchasePanel from "@/components/TicketPurchasePanel";
import JamLeaderManager from "@/components/JamLeaderManager";
import type { ManagedJamLeader, PublicJamLeader } from "@/lib/jamLeaders";
import { jamPath } from "@singjam/core";

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
  /** The jam's short code, for links back to this page (migration 169). */
  shortCode?: string | null;
  userId: string | null;
  rsvpStatus: "attending" | "waitlist" | "cancelled" | null;
  waitlistPosition: number | null;
  attendingCount: number;
  /** Who counts against capacity: the attending RSVPs plus the host's own seat. */
  seatsTaken: number;
  /** Who "Message attendees" reaches: attending RSVPs other than the viewer, plus guest buyers. */
  messageRecipientCount: number;
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
  /** Edit, copy and cancel — narrower than canManage, which co-hosts also get. */
  canEdit: boolean;
  showRsvp: boolean;
  canInvite: boolean;
  invitesEnabled: boolean;
  inviteList: InviteEntry[];
  alreadyInvitedIds: string[];
  /** Music leaders listed publicly, marked in Who's going (official events only). */
  leaders: PublicJamLeader[];
  /** Set when the viewer is one of this event's leaders. */
  myLeader: { userId: string; token: string; showPublicly: boolean } | null;
  /** The full leader list with emails, for whoever can manage the event. */
  managedLeaders: ManagedJamLeader[] | null;
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
    shortCode,
    userId,
    waitlistPosition,
    attendingCount,
    seatsTaken,
    messageRecipientCount,
    pendingInvite,
    isOfficial,
    hasTicketTiers,
    isHost,
    isCoHost,
    canManage,
    canEdit,
    showRsvp,
    canInvite,
    invitesEnabled,
    alreadyInvitedIds,
    leaders,
    myLeader,
    managedLeaders,
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

  const inviteResponse =
    pendingInvite && rsvpStatus !== "attending" && !isHost ? <JamInviteResponse jamId={jamId} /> : null;

  // The set list sits in the left column, under who's going.
  const setList = hasFullAccess ? <JamSetList jamId={jamId} jamName={jam.name} canManage={canManage} /> : null;

  const card = (
    <JamCard
      jam={jamCardData}
      sellsTickets={sellsTickets}
      // Official events sell tickets instead of taking RSVPs — showRsvp is
      // false for them. The map is rendered last on the page for every jam
      // type, below.
      ticketPanel={
        showTicketPanel ? (
          <TicketPurchasePanel
            jamId={jamId}
            eventPath={jamPath({ id: jamId, short_code: shortCode })}
            isSignedIn={!!userId}
            timezone={jamCardData.timezone}
          />
        ) : undefined
      }
      showMap={false}
      actions={
        hasActions ? (
        <>
          {showRsvp && (
            <JamRsvpButton
              jamId={jamId}
              initialStatus={rsvpStatus}
              initialWaitlistPosition={waitlistPosition}
              attendingCount={seatsTaken}
              capacity={jam.capacity}
              onStatusChange={(newStatus) => {
                setRsvpStatus(newStatus);
                setHasFullAccess(isOfficial || newStatus === "attending" || canManage);
              }}
            />
          )}
          {!userId && !isOfficial && (
            <Link
              href={`/auth?next=${jamPath({ id: jamId, short_code: shortCode })}${inviteToken ? `&invite=${inviteToken}` : ""}`}
              className="inline-block rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 transition-colors"
            >
              Sign in to RSVP
            </Link>
          )}
        </>
        ) : undefined
      }
    />
  );


  // Official events that sell here show who's going too. Ticket buyers get an
  // attending RSVP from the Stripe webhook, so the list is populated the same
  // way — guests without an account are the one gap, which is what the sign-up
  // nudge on the completion page is for. See showAttendees above for why an
  // externally-ticketed event gets no list at all.
  const attendees = showAttendees ? (
    <JamAttendeeList
      jamId={jamId}
      hostId={isOfficial ? null : jam.host_user_id}
      isHost={isHost}
      leaderIds={leaders.map((l) => l.user_id).filter((id): id is string => !!id)}
      myLeader={myLeader}
    />
  ) : null;

  const hostTools = (
    <>
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
      {managedLeaders && <JamLeaderManager jamId={jamId} initialLeaders={managedLeaders} />}
      {canManage && <JamHostActions jamId={jamId} canEdit={canEdit} isOfficial={isOfficial} attendingCount={messageRecipientCount} pendingInviteCount={inviteList.filter((inv) => inv.status === "pending").length} />}
    </>
  );

  // Two columns from md up, after Luma: the image (or a date tile) and a
  // compact who's going on the left; title, date and place, tickets and
  // description on the right. Everything after that runs full width below
  // both. The summary is desktop-only, since on a phone the full list is a
  // scroll away. A ticketed event puts the host's admin tools last, under the
  // map.
  return (
    <div className="space-y-4">
      {inviteResponse}
      <JamSplit
        aside={
          <>
            <JamPoster jam={jamCardData} />
            {showAttendees && (
              <div className="hidden md:block">
                <JamAttendeeSummary jamId={jamId} hostId={isOfficial ? null : jam.host_user_id} />
              </div>
            )}
          </>
        }
        asideBelow={setList}
      >
        {card}
      </JamSplit>
      {attendees}
      {showTicketPanel ? (
        <>
          <JamMap jam={jamCardData} />
          {hostTools}
        </>
      ) : (
        <>
          {hostTools}
          <JamMap jam={jamCardData} />
        </>
      )}
    </div>
  );
}
