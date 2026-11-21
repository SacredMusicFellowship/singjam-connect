"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// How long to keep asking before handing the buyer back a manual option. The
// webhook normally lands in a second or two; a minute is far past the point
// where something has gone wrong and a human should be told plainly.
const EVERY_MS = 2000;
const GIVE_UP_AFTER = 30;

/**
 * Re-runs the confirmation page's server render until the order is fulfilled.
 *
 * The page used to render once and tell the buyer to "refresh this page
 * shortly" — asking someone who has just entered their card details to do the
 * polling themselves. This does it for them.
 *
 * Mounted in two situations, and it is the same job either way:
 *  - the payment is genuinely still pending, so the page shows "Confirming…"
 *  - Stripe has confirmed the card but our fulfilment has not landed, so the
 *    page already reads as paid and this is just filling in the ticket count
 *    and the email line
 *
 * It unmounts as soon as the server render stops asking for it, which is what
 * stops the polling — there is no success signal to watch for here.
 */
export default function TicketConfirmationPoller({
  quiet = false,
}: {
  /** Poll without saying anything — used once the page already reads as paid. */
  quiet?: boolean;
}) {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);
  const gaveUp = attempts >= GIVE_UP_AFTER;

  useEffect(() => {
    if (gaveUp) return;
    const id = setTimeout(() => {
      setAttempts((n) => n + 1);
      router.refresh();
    }, EVERY_MS);
    return () => clearTimeout(id);
  }, [attempts, gaveUp, router]);

  if (quiet) return null;

  if (gaveUp) {
    return (
      <p className="text-sm text-zinc-600">
        This is taking longer than it should. Your tickets are held and nothing further will be
        charged — if you have an email receipt from Stripe, the payment went through. Please{" "}
        <a href="mailto:events@singjam.org" className="underline hover:text-zinc-800">
          contact us
        </a>{" "}
        and we&apos;ll sort it out.
      </p>
    );
  }

  return (
    <p className="flex items-center gap-2 text-sm text-zinc-600" aria-live="polite">
      <span
        aria-hidden="true"
        className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600"
      />
      Just a moment — this page updates itself, there&apos;s nothing you need to do.
    </p>
  );
}
