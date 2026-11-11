// Row shapes for the tables the fixtures populate, matching the columns produced by
// supabase/migrations (checked by applying every migration and reading information_schema).
// Columns the database fills with a default the fixtures don't care about are left out.
// Timestamps are ISO strings relative to FIXED_NOW; the seed writer re-anchors them to now().

export type Iso = string;
export type Uuid = string;

export type UserRole = "member" | "song_editor" | "admin";
export type JamVisibility = "private" | "community" | "official";
export type RsvpStatus = "attending" | "waitlist" | "cancelled";
export type InviteStatus = "pending" | "accepted" | "declined";
export type Confidence = "lead" | "support" | "learn";
export type LinkSharing = "private" | "link" | "public";
export type CollaboratorRole = "editor" | "viewer" | "co-owner";
export type CollaboratorStatus = "pending" | "accepted" | "requested";
export type OrderStatus = "pending" | "paid" | "failed" | "expired" | "refunded" | "cancelled";
export type AttendanceSource = "checkin" | "ac_import" | "set_join";
export type InstrumentLevel = "Beginner" | "Intermediate" | "Advanced" | "Professional";
export type NotificationType =
  | "jam_invite"
  | "jam_cohost_added"
  | "invite_accepted"
  | "invite_declined"
  | "set_collaborator_added"
  | "set_access_request"
  | "set_access_granted"
  | "jam_updated"
  | "jam_cancelled";

export type AuthUserRow = {
  id: Uuid;
  email: string;
  // Plain text; the seed writer hashes it with crypt()/gen_salt('bf') so it never sits in SQL.
  password: string;
  created_at: Iso;
};

export type ProfileRow = {
  id: Uuid;
  username: string | null;
  display_name: string | null;
  last_name: string | null;
  neighborhood: string | null;
  avatar_url: null;
  singing_voice: string | null;
  instruments: string[];
  instrument_levels: Record<string, InstrumentLevel>;
  favorite_genres: string[];
  role: UserRole;
  can_host_official: boolean;
  created_at: Iso;
};

export type PersonRow = { id: Uuid; name: string };
export type ArtistRow = { id: Uuid; name: string };

export type SongRow = {
  id: Uuid;
  title: string;
  slug: string;
  display_artist: string;
  first_line: string | null;
  year: number | null;
  tonality: string | null;
  meter: string | null;
  vibe: "Banger" | "Ballad" | null;
  youtube_url: null;
  chord_chart_url: null;
};

export type SongComposerRow = { song_id: Uuid; person_id: Uuid };
export type SongRecordingArtistRow = { song_id: Uuid; artist_id: Uuid; year: number | null; position: number };
// Tags are reference data seeded by the migrations with random ids, so they're referenced by type and name.
export type TagType = "genre" | "theme" | "culture" | "language" | "form" | "occasion" | "community";
export type SongTagRow = { song_id: Uuid; tag_type: TagType; tag_name: string };

export type UserSongRow = { user_id: Uuid; song_id: Uuid; confidence: Confidence; key_note: string | null };

export type JamRow = {
  id: Uuid;
  short_code: string;
  name: string;
  host_user_id: Uuid;
  visibility: JamVisibility;
  starts_at: Iso;
  ends_at: Iso;
  timezone: string;
  neighborhood: string;
  full_address: string;
  notes: string;
  capacity: number | null;
  ticket_limit: number | null;
  guests_can_invite: boolean;
  image_url: null;
  created_at: Iso;
};

export type JamTagRow = { jam_id: Uuid; tag_type: TagType; tag_name: string };
export type JamCohostRow = { id: Uuid; jam_id: Uuid; user_id: Uuid; added_by: Uuid };
export type JamRsvpRow = { id: Uuid; jam_id: Uuid; user_id: Uuid; status: RsvpStatus; waitlist_position: number | null; created_at: Iso };
export type JamInviteRow = { id: Uuid; jam_id: Uuid; invited_user_id: Uuid; invited_by: Uuid; status: InviteStatus; created_at: Iso };

export type SetRow = {
  id: Uuid;
  short_code: string;
  name: string;
  description: string | null;
  owner_user_id: Uuid;
  jam_id: Uuid | null;
  link_sharing: LinkSharing;
  created_at: Iso;
};

export type SetSongRow = {
  id: Uuid;
  set_id: Uuid;
  song_id: Uuid;
  position: number;
  added_by_user_id: Uuid;
  key_note: string | null;
  leader_user_ids: Uuid[];
  played: boolean;
  notes: string | null;
};

export type SetCollaboratorRow = {
  id: Uuid;
  set_id: Uuid;
  user_id: Uuid;
  invited_by: Uuid;
  role: CollaboratorRole;
  status: CollaboratorStatus;
};

export type TicketTypeRow = {
  id: Uuid;
  jam_id: Uuid;
  name: string;
  description: string | null;
  price_cents: number;
  quantity: number | null;
  sort_order: number;
};

export type TicketOrderRow = {
  id: Uuid;
  jam_id: Uuid;
  buyer_user_id: Uuid | null;
  buyer_email: string;
  buyer_name: string;
  status: OrderStatus;
  amount_cents: number;
  stripe_fee_cents: number | null;
  stripe_checkout_session_id: string;
  stripe_payment_intent_id: string | null;
  expires_at: Iso;
  paid_at: Iso | null;
  created_at: Iso;
};

export type TicketRow = {
  id: Uuid;
  order_id: Uuid;
  ticket_type_id: Uuid;
  jam_id: Uuid;
  holder_user_id: Uuid | null;
  holder_name: string;
  holder_email: string;
  checked_in_at: Iso | null;
};

export type EventAttendanceRow = {
  id: Uuid;
  jam_id: Uuid;
  email: string;
  user_id: Uuid | null;
  name: string;
  source: AttendanceSource;
  created_at: Iso;
};

export type NotificationRow = {
  id: Uuid;
  user_id: Uuid;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: Iso;
};

export type Scenario = {
  authUsers: AuthUserRow[];
  profiles: ProfileRow[];
  people: PersonRow[];
  artists: ArtistRow[];
  songs: SongRow[];
  songComposers: SongComposerRow[];
  songRecordingArtists: SongRecordingArtistRow[];
  songTags: SongTagRow[];
  userSongs: UserSongRow[];
  jams: JamRow[];
  jamTags: JamTagRow[];
  jamCohosts: JamCohostRow[];
  jamRsvps: JamRsvpRow[];
  jamInvites: JamInviteRow[];
  sets: SetRow[];
  setSongs: SetSongRow[];
  setCollaborators: SetCollaboratorRow[];
  ticketTypes: TicketTypeRow[];
  ticketOrders: TicketOrderRow[];
  tickets: TicketRow[];
  eventAttendance: EventAttendanceRow[];
  notifications: NotificationRow[];
};
