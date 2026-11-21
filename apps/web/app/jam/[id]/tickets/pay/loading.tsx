// The page retrieves the Stripe session server-side before it can render, so
// there is a real wait here. Mirrors the payment panel's column and the shape
// TicketCheckoutForm shows while Stripe.js mounts, so the two hand over without
// the layout jumping.
export default function TicketPaymentLoading() {
  return (
    <div className="mx-auto max-w-sm space-y-3" aria-busy="true">
      <div>
        <div className="h-5 w-24 animate-pulse rounded bg-zinc-200" />
        <div className="mt-1.5 h-4 w-48 animate-pulse rounded bg-zinc-100" />
      </div>
      <div className="space-y-3 rounded-xl border border-zinc-200 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-baseline justify-between gap-3">
            <div className="h-4 w-24 animate-pulse rounded bg-zinc-100" />
            <div className="h-4 w-12 animate-pulse rounded bg-zinc-100" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-4 w-28 animate-pulse rounded bg-zinc-200" />
        <div className="h-11 animate-pulse rounded-xl bg-zinc-200" />
        <div className="h-11 animate-pulse rounded-xl bg-zinc-200" />
        <div className="h-11 w-full animate-pulse rounded-xl bg-zinc-200" />
      </div>
    </div>
  );
}
