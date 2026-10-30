import Link from "next/link";

export default function SetJoinPrompt({
  setId,
  shortCode,
  setName,
  ownerName,
  mode = "join",
}: {
  setId: string;
  shortCode?: string | null;
  setName: string;
  ownerName: string | null;
  mode?: "join" | "view";
}) {
  const isJoin = mode === "join";

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-sm w-full space-y-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
          </svg>
        </div>

        <div className="space-y-2">
          <h1 className="text-lg font-semibold text-zinc-900">
            {isJoin ? "Join this set list" : "Sign in to view this set"}
          </h1>
          <p className="text-sm text-zinc-500 leading-relaxed">
            {isJoin ? (
              <>
                {ownerName ? (
                  <><span className="font-medium text-zinc-700">{ownerName}</span> has shared{" "}</>
                ) : (
                  "You've been invited to join "
                )}
                <span className="font-medium text-zinc-700">{setName}</span> with you.
                {" "}Sign in or create a free account to see the songs and mark which ones you know.
              </>
            ) : (
              <>
                <span className="font-medium text-zinc-700">{setName}</span> is only available to SingJam users.
                {" "}Sign in or create a free account to view it.
              </>
            )}
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <Link
            href={`/auth?next=/set/${shortCode || setId}`}
            className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href={`/auth?mode=signup&next=/set/${shortCode || setId}`}
            className="rounded-xl border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Create a free account
          </Link>
        </div>
      </div>
    </div>
  );
}
