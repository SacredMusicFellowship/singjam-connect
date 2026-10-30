"use client";

import { useEffect, useRef, useState } from "react";

/**
 * An event description, capped at about eleven lines from md up so a long one
 * doesn't run far past the poster column beside it. Phones, with nothing
 * beside it, always show the whole thing. "Show more" only appears when the
 * cap actually cuts something off, re-measured whenever the width changes.
 */
export default function CollapsibleDescription({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  const collapsed = !expanded && clipped;

  return (
    <div>
      <div className="relative">
        <p
          ref={ref}
          className={`whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 ${expanded ? "" : "md:max-h-64 md:overflow-hidden"}`}
        >
          {text}
        </p>
        {collapsed && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-50" />
        )}
      </div>
      {collapsed && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 text-sm font-medium text-zinc-700 hover:underline"
        >
          Show more
        </button>
      )}
    </div>
  );
}
