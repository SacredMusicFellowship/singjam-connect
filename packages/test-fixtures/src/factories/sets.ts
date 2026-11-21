import { MUSICAL_KEYS } from "@singjam/core";
import type { FixtureContext } from "../context";
import type { CollaboratorRole, CollaboratorStatus, LinkSharing, SetCollaboratorRow, SetRow, SetSongRow, SongRow } from "../types";

export type SetOptions = {
  key: string;
  name: string;
  description?: string | null;
  ownerUserId: string;
  jamId?: string | null;
  linkSharing: LinkSharing;
  songs: readonly SongRow[];
  // Members who can be named as song leaders.
  leaderPool?: readonly string[];
  playedCount?: number;
};

export function buildSet(ctx: FixtureContext, options: SetOptions): { set: SetRow; songs: SetSongRow[] } {
  const { rng } = ctx;
  const id = ctx.id("set", options.key);
  const leaderPool = options.leaderPool ?? [];
  const playedCount = options.playedCount ?? 0;

  return {
    set: {
      id,
      short_code: ctx.shortCode("set", options.key),
      name: options.name,
      description: options.description ?? null,
      owner_user_id: options.ownerUserId,
      jam_id: options.jamId ?? null,
      link_sharing: options.linkSharing,
      created_at: ctx.at(-rng.int(5, 40)),
    },
    songs: options.songs.map((song, position) => ({
      id: ctx.id("set-song", `${options.key}:${song.id}`),
      set_id: id,
      song_id: song.id,
      position,
      added_by_user_id: options.ownerUserId,
      key_note: rng.chance(0.5) ? rng.pick(MUSICAL_KEYS) : null,
      leader_user_ids: leaderPool.length && rng.chance(0.6) ? [rng.pick(leaderPool)] : [],
      played: position < playedCount,
      notes: position === 0 ? "Start slow, everyone joins on the chorus" : null,
    })),
  };
}

export function buildCollaborator(
  ctx: FixtureContext,
  set: SetRow,
  userId: string,
  role: CollaboratorRole,
  status: CollaboratorStatus,
): SetCollaboratorRow {
  return {
    id: ctx.id("collaborator", `${set.id}:${userId}`),
    set_id: set.id,
    user_id: userId,
    invited_by: set.owner_user_id,
    role,
    status,
  };
}
