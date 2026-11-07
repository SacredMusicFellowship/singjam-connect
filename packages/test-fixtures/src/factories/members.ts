import { E2E_PASSWORD, EMAIL_DOMAIN } from "../constants";
import type { FixtureContext } from "../context";
import { FIRST_NAMES, GENRES, INSTRUMENT_LEVELS, INSTRUMENTS, LAST_NAMES, NEIGHBORHOODS, SINGING_VOICES } from "../names";
import type { AuthUserRow, InstrumentLevel, ProfileRow, UserRole } from "../types";

export type Member = { auth: AuthUserRow; profile: ProfileRow };

export type MemberOptions = {
  key: string;
  firstName?: string;
  lastName?: string;
  username?: string | null;
  role?: UserRole;
  canHostOfficial?: boolean;
  joinedDaysAgo?: number;
};

export function buildMember(ctx: FixtureContext, options: MemberOptions): Member {
  const { rng } = ctx;
  const firstName = options.firstName ?? rng.pick(FIRST_NAMES);
  const lastName = options.lastName ?? rng.pick(LAST_NAMES);
  const id = ctx.id("member", options.key);
  const handle = `${firstName}${lastName}`.toLowerCase().replace(/[^a-z0-9]/g, "");
  const createdAt = ctx.at(-(options.joinedDaysAgo ?? rng.int(30, 400)));

  const instruments = rng.sample(INSTRUMENTS, rng.int(1, 3));
  const instrumentLevels: Record<string, InstrumentLevel> = {};
  for (const name of instruments) instrumentLevels[name] = rng.pick(INSTRUMENT_LEVELS);

  // A member who hasn't finished setup has no username or profile details yet, like a fresh signup.
  const unfinished = options.username === null;

  return {
    auth: {
      id,
      email: `${options.key.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}@${EMAIL_DOMAIN}`,
      password: E2E_PASSWORD,
      created_at: createdAt,
    },
    profile: {
      id,
      username: unfinished ? null : (options.username ?? handle),
      display_name: unfinished ? null : firstName,
      last_name: unfinished ? null : lastName,
      neighborhood: unfinished ? null : rng.pick(NEIGHBORHOODS),
      // Initials are rendered from the name; no photos of anyone, real or generated.
      avatar_url: null,
      singing_voice: unfinished ? null : rng.pick(SINGING_VOICES).join(","),
      instruments: unfinished ? [] : instruments,
      instrument_levels: unfinished ? {} : instrumentLevels,
      favorite_genres: unfinished ? [] : rng.sample(GENRES, rng.int(2, 5)),
      role: options.role ?? "member",
      can_host_official: options.canHostOfficial ?? false,
      created_at: createdAt,
    },
  };
}

// Accounts that tests and screenshots refer to by key. Everyone else is generated.
export const PERSONAS = {
  admin: { key: "admin", firstName: "Avery", lastName: "Ashgrove", role: "admin" },
  host: { key: "host", firstName: "Harlow", lastName: "Hollowmere", canHostOfficial: true },
  member: { key: "member", firstName: "Rowan", lastName: "Reedbank" },
  newcomer: { key: "newcomer", firstName: "Nico", lastName: "Nettlefold", joinedDaysAgo: 2 },
  unfinished: { key: "unfinished", username: null, joinedDaysAgo: 0 },
  editor: { key: "song-editor", firstName: "Sable", lastName: "Starling", role: "song_editor" },
} as const satisfies Record<string, MemberOptions>;

export type PersonaKey = keyof typeof PERSONAS;

export function buildCrowd(ctx: FixtureContext, count: number): Member[] {
  // Usernames must be unique (profiles_username_lower_idx), so the crowd uses its index.
  return Array.from({ length: count }, (_, i) => {
    const member = buildMember(ctx, { key: `crowd-${i + 1}` });
    member.profile.username = `${member.profile.username}${i + 1}`;
    return member;
  });
}
