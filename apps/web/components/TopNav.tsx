"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProfile } from "@/components/ProfileProvider";
import NavMenu from "./NavMenu";

export default function TopNav() {
  const pathname = usePathname();
  const { signedIn, profile } = useProfile();

  if (pathname === "/auth/reset-password") return null;

  return (
    <nav className="flex items-center gap-1 text-sm">
      <Link href="/search" aria-label="Search songs" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z" />
        </svg>
      </Link>
      <Link href="/jams" className="rounded-full px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
        Jams
      </Link>
      <Link href="/sets" className="rounded-full px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
        Sets
      </Link>
      <Link href="/repertoire" className="rounded-full px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
        Repertoire
      </Link>
      <Link href="/friends" className="rounded-full px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
        Friends
      </Link>

      <div className="mx-2 h-4 w-px bg-slate-700" />

      {signedIn ? (
        <>
          <NavMenu />
          {profile?.role === "song_editor" && (
            <Link
              href="/song-editor"
              className="rounded-full bg-teal-500/20 px-3 py-1.5 text-xs font-semibold text-teal-300 hover:bg-teal-500/30 transition-colors"
            >
              Song Editor
            </Link>
          )}
          {profile?.role === "admin" && (
            <Link
              href="/admin/songs"
              className="rounded-full bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/30 transition-colors"
            >
              Admin
            </Link>
          )}
        </>
      ) : (
        <Link
          href={pathname === "/" ? "/auth" : `/auth?next=${encodeURIComponent(pathname)}`}
          className="rounded-full bg-amber-500 px-3 py-1.5 font-medium text-white hover:bg-amber-400 transition-colors"
        >
          Sign in
        </Link>
      )}
    </nav>
  );
}
