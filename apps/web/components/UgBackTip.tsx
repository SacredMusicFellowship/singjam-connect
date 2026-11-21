"use client";

import { useEffect, useState } from "react";
import { UltimateGuitarIcon } from "@/components/setDetailShared";

const DISMISSED_KEY = "sj-ug-back-tip-dismissed";

// The Ultimate Guitar app reopens the last chart unless you tap its own back
// arrow before leaving it. Only phones and tablets open charts in the app, so
// the tip is for coarse pointers; "(pointer: coarse)" also catches iPads that
// report themselves as desktop Safari.
export default function UgBackTip({ className = "" }: { className?: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    try {
      if (localStorage.getItem(DISMISSED_KEY)) return;
    } catch {}
    setShow(true);
  }, []);

  if (!show) return null;

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
  }

  return (
    <div className={`flex items-start gap-2.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 ${className}`}>
      <span className="shrink-0 pt-0.5"><UltimateGuitarIcon /></span>
      <p className="flex-1 text-xs text-zinc-600">
        Using the Ultimate Guitar app? Tap the back arrow <em>inside UG</em> before you return here, or the next chart will open the same song again.
      </p>
      <button onClick={dismiss} className="shrink-0 text-xs font-medium text-amber-600 hover:text-amber-500">
        Got it
      </button>
    </div>
  );
}
