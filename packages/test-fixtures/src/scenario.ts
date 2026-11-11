import { DEFAULT_SEED, FIXED_NOW } from "./constants";
import { createContext } from "./context";
import { buildInvite, buildJam, buildRsvps } from "./factories/jams";
import { buildCrowd, buildMember, PERSONAS, type Member, type PersonaKey } from "./factories/members";
import { buildNotification, jamLink, setLink } from "./factories/notifications";
import { buildRepertoire } from "./factories/repertoire";
import { buildCollaborator, buildSet } from "./factories/sets";
import { buildSongCatalog } from "./factories/songs";
import { buildCheckIns, buildOrder, buildTicketTypes, guestBuyer, type Buyer } from "./factories/tickets";
import { HOUSE_ADDRESSES, VENUES } from "./names";
import type { JamRow, Scenario, SetRow, SongRow } from "./types";

export type ScenarioOptions = { seed?: number; now?: Date; crowdSize?: number };

export type ScenarioRefs = {
  members: Record<PersonaKey, Member>;
  jams: {
    officialNext: JamRow;
    officialLater: JamRow;
    officialPast: JamRow;
    communityUpcoming: JamRow;
    communityFull: JamRow;
    privateUpcoming: JamRow;
    communityPast: JamRow;
  };
  sets: { officialNext: SetRow; memberPrivate: SetRow; memberShared: SetRow };
  songs: SongRow[];
};

// The whole fake world used by the seed, e2e tests and screenshots. Same seed, same world.
export function buildScenario(options: ScenarioOptions = {}): { scenario: Scenario; refs: ScenarioRefs } {
  const ctx = createContext(options.seed ?? DEFAULT_SEED, options.now ?? FIXED_NOW);
  const { rng } = ctx;

  const personas = Object.fromEntries(
    Object.entries(PERSONAS).map(([name, persona]) => [name, buildMember(ctx, persona)]),
  ) as Record<PersonaKey, Member>;
  const crowd = buildCrowd(ctx, options.crowdSize ?? 14);
  const members = [...Object.values(personas), ...crowd];
  const { admin, host, member, newcomer, editor } = personas;
  const crowdIds = crowd.map((m) => m.profile.id);

  const catalog = buildSongCatalog(ctx);
  const { songs } = catalog;

  // Repertoire. The member, host and first few of the crowd share a core of songs so the friends
  // page has strong matches; the newcomer starts empty to show the "build your repertoire" prompt.
  const core = songs.slice(0, 8);
  const userSongs = [
    ...buildRepertoire(ctx, member.profile.id, songs, 24, core),
    ...buildRepertoire(ctx, host.profile.id, songs, 30, core),
    ...buildRepertoire(ctx, admin.profile.id, songs, 12),
    ...buildRepertoire(ctx, editor.profile.id, songs, 18),
    ...crowd.flatMap((m, i) => buildRepertoire(ctx, m.profile.id, songs, rng.int(6, 22), i < 5 ? core.slice(0, 5 - i) : [])),
  ];

  // Jams.
  const [lantern, kettle, grange] = VENUES;
  const official = (key: string, days: number, venue: (typeof VENUES)[number], name: string) =>
    buildJam(ctx, {
      key, name, hostUserId: host.profile.id, visibility: "official", startsInDays: days, startHour: 19, durationHours: 2.5,
      neighborhood: venue.neighborhood, fullAddress: venue.address, capacity: 120, ticketLimit: 6,
      notes: "Come sing! A communal singing night with lyrics and chords on screen. Acoustic instruments welcome.\n\nDoors 6:30pm, singing at 7pm.",
      genres: ["Folk", "Rock", "Soul", "Country"],
    });
  const officialNext = official("official-next", 9, lantern, `SingJam at ${lantern.name}`);
  const officialLater = official("official-later", 30, kettle, `SingJam at ${kettle.name}`);
  const officialPast = official("official-past", -21, grange, `SingJam at ${grange.name}`);

  const communityUpcoming = buildJam(ctx, {
    key: "community-upcoming", name: "Porch Harmonies", hostUserId: member.profile.id, visibility: "community",
    startsInDays: 4, startHour: 18, durationHours: 3, neighborhood: "Maple Hollow", fullAddress: HOUSE_ADDRESSES[0],
    notes: "Bring a song you love to lead. Snacks provided.", capacity: 12, guestsCanInvite: true, genres: ["Folk", "Americana"],
  });
  const communityFull = buildJam(ctx, {
    key: "community-full", name: "Shanty Night", hostUserId: crowdIds[0], visibility: "community",
    startsInDays: 12, startHour: 19, durationHours: 2, neighborhood: "Harbor Point", fullAddress: HOUSE_ADDRESSES[1],
    notes: "Sea shanties and drinking songs. Small room, so space is limited.", capacity: 4, genres: ["Shanty", "Celtic"],
  });
  const privateUpcoming = buildJam(ctx, {
    key: "private-upcoming", name: "Leaders' Rehearsal", hostUserId: host.profile.id, visibility: "private",
    startsInDays: 6, startHour: 19, durationHours: 2, neighborhood: "Fox Glen", fullAddress: HOUSE_ADDRESSES[2],
    notes: "Run-through of next week's set with song leaders.", capacity: 10,
  });
  const communityPast = buildJam(ctx, {
    key: "community-past", name: "Kitchen Table Sing", hostUserId: crowdIds[1], visibility: "community",
    startsInDays: -10, startHour: 17, durationHours: 2, neighborhood: "Cedar Flats", fullAddress: HOUSE_ADDRESSES[0],
    notes: "Easy songs, all levels.", capacity: null, genres: ["Gospel", "Folk"],
  });
  const builtJams = [officialNext, officialLater, officialPast, communityUpcoming, communityFull, privateUpcoming, communityPast];

  const jamRsvps = [
    ...buildRsvps(ctx, officialNext.jam, [member.profile.id, newcomer.profile.id, ...crowdIds.slice(0, 8)]),
    ...buildRsvps(ctx, officialLater.jam, [member.profile.id, ...crowdIds.slice(4, 7)]),
    ...buildRsvps(ctx, communityUpcoming.jam, [member.profile.id, host.profile.id, ...crowdIds.slice(2, 6)]),
    // Capacity 4 with 6 RSVPs: two on the waitlist.
    ...buildRsvps(ctx, communityFull.jam, [crowdIds[0], member.profile.id, ...crowdIds.slice(5, 9)]),
    ...buildRsvps(ctx, privateUpcoming.jam, [host.profile.id, member.profile.id]),
    ...buildRsvps(ctx, communityPast.jam, [crowdIds[1], member.profile.id, ...crowdIds.slice(8, 12)]),
  ];
  const jamInvites = [
    buildInvite(ctx, privateUpcoming.jam, member.profile.id, "accepted"),
    buildInvite(ctx, privateUpcoming.jam, crowdIds[9], "pending"),
    buildInvite(ctx, privateUpcoming.jam, crowdIds[10], "declined"),
  ];
  const jamCohosts = [
    { id: ctx.id("cohost", officialNext.jam.id), jam_id: officialNext.jam.id, user_id: admin.profile.id, added_by: host.profile.id },
  ];

  // Tickets: paid orders from members and guests, with check-ins for the past event.
  const ticketTypes = [officialNext, officialLater, officialPast].flatMap(({ jam }) => buildTicketTypes(ctx, jam));
  const typesFor = (jam: JamRow) => ticketTypes.filter((t) => t.jam_id === jam.id);
  const asBuyer = (m: Member): Buyer => ({ userId: m.profile.id, name: `${m.profile.display_name} ${m.profile.last_name}`, email: m.auth.email });
  const orders = [
    buildOrder(ctx, officialNext.jam, asBuyer(member), [{ type: typesFor(officialNext.jam)[0], quantity: 2 }]),
    buildOrder(ctx, officialNext.jam, asBuyer(crowd[0]), [{ type: typesFor(officialNext.jam)[0], quantity: 1 }, { type: typesFor(officialNext.jam)[1], quantity: 2 }]),
    buildOrder(ctx, officialNext.jam, guestBuyer("guest-marlowe", "Marlowe Fernhill"), [{ type: typesFor(officialNext.jam)[0], quantity: 3 }]),
    buildOrder(ctx, officialNext.jam, guestBuyer("guest-pending", "Pax Larkspur"), [{ type: typesFor(officialNext.jam)[0], quantity: 1 }], "expired"),
    buildOrder(ctx, officialLater.jam, asBuyer(crowd[4]), [{ type: typesFor(officialLater.jam)[0], quantity: 1 }]),
    buildOrder(ctx, officialPast.jam, asBuyer(member), [{ type: typesFor(officialPast.jam)[0], quantity: 1 }]),
    buildOrder(ctx, officialPast.jam, guestBuyer("guest-quill", "Quill Oakhurst"), [{ type: typesFor(officialPast.jam)[0], quantity: 2 }]),
    buildOrder(ctx, officialPast.jam, asBuyer(crowd[2]), [{ type: typesFor(officialPast.jam)[0], quantity: 1 }], "refunded"),
  ];
  const pastTickets = orders
    .filter(({ order }) => order.jam_id === officialPast.jam.id && order.status === "paid")
    .flatMap(({ tickets }) => tickets);
  const eventAttendance = buildCheckIns(ctx, officialPast.jam, pastTickets);

  // Sets.
  const leaderPool = [host.profile.id, member.profile.id, ...crowdIds.slice(0, 3)];
  const officialNextSet = buildSet(ctx, {
    key: "official-next", name: `${officialNext.jam.name} – song menu`, ownerUserId: host.profile.id,
    jamId: officialNext.jam.id, linkSharing: "public", songs: songs.slice(0, 12), leaderPool,
    description: "Feel free to add songs you'd love to sing, and we may give them a go!",
  });
  const officialPastSet = buildSet(ctx, {
    key: "official-past", name: `${officialPast.jam.name} – song menu`, ownerUserId: host.profile.id,
    jamId: officialPast.jam.id, linkSharing: "public", songs: songs.slice(12, 22), leaderPool, playedCount: 8,
  });
  const communitySet = buildSet(ctx, {
    key: "community-upcoming", name: "Porch Harmonies set list", ownerUserId: member.profile.id,
    jamId: communityUpcoming.jam.id, linkSharing: "link", songs: core.slice(0, 6), leaderPool,
  });
  const memberPrivate = buildSet(ctx, {
    key: "member-private", name: "Songs to practice", ownerUserId: member.profile.id, linkSharing: "private",
    songs: songs.slice(20, 26),
  });
  const memberShared = buildSet(ctx, {
    key: "member-shared", name: "Campfire favorites", ownerUserId: crowdIds[3], linkSharing: "public",
    songs: songs.slice(26, 34), leaderPool,
  });
  const builtSets = [officialNextSet, officialPastSet, communitySet, memberPrivate, memberShared];
  const setCollaborators = [
    buildCollaborator(ctx, communitySet.set, host.profile.id, "editor", "accepted"),
    buildCollaborator(ctx, memberShared.set, member.profile.id, "editor", "accepted"),
    buildCollaborator(ctx, memberPrivate.set, crowdIds[5], "viewer", "pending"),
    buildCollaborator(ctx, officialNextSet.set, crowdIds[6], "editor", "requested"),
  ];

  const notifications = [
    buildNotification(ctx, { key: "member-invite", userId: member.profile.id, type: "jam_invite", title: `${host.profile.display_name} invited you to ${privateUpcoming.jam.name}`, link: jamLink(privateUpcoming.jam), hoursAgo: 3 }),
    buildNotification(ctx, { key: "member-collab", userId: member.profile.id, type: "set_collaborator_added", title: `You can now edit ${memberShared.set.name}`, link: setLink(memberShared.set), hoursAgo: 26, read: true }),
    buildNotification(ctx, { key: "member-updated", userId: member.profile.id, type: "jam_updated", title: `${communityFull.jam.name} has a new start time`, link: jamLink(communityFull.jam), hoursAgo: 50, read: true }),
    buildNotification(ctx, { key: "host-request", userId: host.profile.id, type: "set_access_request", title: `${crowd[6].profile.display_name} asked to edit ${officialNextSet.set.name}`, link: setLink(officialNextSet.set), hoursAgo: 5 }),
    buildNotification(ctx, { key: "admin-cohost", userId: admin.profile.id, type: "jam_cohost_added", title: `${host.profile.display_name} added you as a co-host of ${officialNext.jam.name}`, link: jamLink(officialNext.jam), hoursAgo: 72, read: true }),
  ];

  const scenario: Scenario = {
    authUsers: members.map((m) => m.auth),
    profiles: members.map((m) => m.profile),
    people: catalog.people,
    artists: catalog.artists,
    songs,
    songComposers: catalog.songComposers,
    songRecordingArtists: catalog.songRecordingArtists,
    songTags: catalog.songTags,
    userSongs,
    jams: builtJams.map((b) => b.jam),
    jamTags: builtJams.flatMap((b) => b.tags),
    jamCohosts,
    jamRsvps,
    jamInvites,
    sets: builtSets.map((b) => b.set),
    setSongs: builtSets.flatMap((b) => b.songs),
    setCollaborators,
    ticketTypes,
    ticketOrders: orders.map((o) => o.order),
    tickets: orders.flatMap((o) => o.tickets),
    eventAttendance,
    notifications,
  };

  return {
    scenario,
    refs: {
      members: personas,
      jams: {
        officialNext: officialNext.jam, officialLater: officialLater.jam, officialPast: officialPast.jam,
        communityUpcoming: communityUpcoming.jam, communityFull: communityFull.jam,
        privateUpcoming: privateUpcoming.jam, communityPast: communityPast.jam,
      },
      sets: { officialNext: officialNextSet.set, memberPrivate: memberPrivate.set, memberShared: memberShared.set },
      songs,
    },
  };
}
