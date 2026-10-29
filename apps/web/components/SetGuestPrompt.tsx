import Link from "next/link";

/**
 * Sign-up nudge for a signed-out visitor on a public set, in the same card as
 * the guest prompts on /sets and the song page. An event's set gets its own
 * pitch: guests land here from their ticket email, and signing up with the
 * address they bought with claims the ticket and makes them an editor of the
 * set (claimGuestTickets → markAttending), so "add songs" is a real promise.
 */
export default function SetGuestPrompt({ setId, forEvent }: { setId: string; forEvent: boolean }) {
  return (
    <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
      <p className="text-base font-semibold text-zinc-900">
        {forEvent ? "Help choose songs for this SingJam" : "Make this set your own"}
      </p>
      <p className="mt-2 text-sm text-zinc-500">
        {forEvent
          ? "Going? Create a free account with the email on your ticket to add the songs you'd love to sing."
          : "Sign up to copy this set, mark the songs you know, and build sets of your own."}
      </p>
      <Link
        href={`/auth?mode=signup&next=/set/${setId}`}
        className="mt-4 inline-block text-sm font-medium text-amber-600 hover:text-amber-500"
      >
        Sign up →
      </Link>
    </div>
  );
}
