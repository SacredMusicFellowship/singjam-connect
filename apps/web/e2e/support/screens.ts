import type { PersonaKey } from "@singjam/test-fixtures";
import { refs } from "../fixtures";

// Every main screen, and who views it. pages.spec.ts checks each one; the screenshot capture
// photographs each one at phone and desktop size.
export type Screen = { name: string; url: string; as: PersonaKey | "visitor" };

export const SCREENS: Screen[] = [
  { name: "home-visitor", url: "/", as: "visitor" },
  { name: "sign-in", url: "/auth", as: "visitor" },
  { name: "home", url: "/", as: "member" },
  { name: "jams", url: "/jams", as: "member" },
  { name: "jam", url: `/jam/${refs.jams.officialNext.id}`, as: "member" },
  { name: "jam-community", url: `/jam/${refs.jams.communityUpcoming.id}`, as: "newcomer" },
  { name: "sets", url: "/sets", as: "member" },
  { name: "set", url: `/set/${refs.sets.memberShared.id}`, as: "member" },
  { name: "songs", url: "/songs", as: "member" },
  { name: "song", url: `/songs/${refs.songs[0].slug}`, as: "member" },
  { name: "friends", url: "/friends", as: "member" },
  { name: "repertoire", url: "/repertoire", as: "member" },
  { name: "repertoire-empty", url: "/repertoire", as: "newcomer" },
  { name: "notifications", url: "/notifications", as: "member" },
  { name: "profile", url: "/profile", as: "member" },
  { name: "account", url: "/account", as: "member" },
  { name: "admin", url: "/admin", as: "admin" },
];
