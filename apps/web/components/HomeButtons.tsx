"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function HomeButtons() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    // Read the Supabase auth cookie synchronously — no network call, no SDK import.
    // Supabase stores session cookies as sb-*-auth-token or sb-*-auth-token.0 etc.
    setSignedIn(document.cookie.split(";").some((c) => c.trim().match(/^sb-.+-auth-token/)));
  }, []);

  if (signedIn) {
    return (
      <>
        <Link
          href="/search"
          className="rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-400 transition-colors"
        >
          Add songs
        </Link>
        <Link
          href="/jams"
          className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-100 transition-colors"
        >
          Join a jam
        </Link>
      </>
    );
  }

  return (
    <Link
      href="/auth?mode=signup"
      className="rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-400 transition-colors"
    >
      Join us
    </Link>
  );
}
