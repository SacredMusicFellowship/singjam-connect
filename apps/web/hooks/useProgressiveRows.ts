import { useEffect, useState, useTransition } from "react";

export const FIRST_ROWS = 40;
const ROWS_PER_BATCH = 100;
// Shorter than any real row, so a return visit always draws at least enough
// rows to reach the saved scroll position.
const MIN_ROW_HEIGHT = 60;

// How many rows the first paint needs: a screenful, or on a return visit
// everything down to (and a screen past) where the visitor left off.
export function firstRowCount(savedScrollY: number | null, viewportHeight: number): number {
  if (!savedScrollY || savedScrollY <= 0) return FIRST_ROWS;
  return FIRST_ROWS + Math.ceil((savedScrollY + viewportHeight * 2) / MIN_ROW_HEIGHT);
}

function savedScrollY(key: string): number | null {
  try {
    const raw = sessionStorage.getItem(key);
    const y = raw ? JSON.parse(raw).y : null;
    return typeof y === "number" ? y : null;
  } catch {
    return null;
  }
}

// Drawing a long list in one go freezes a phone for seconds (a 900-song
// repertoire is ~50,000 elements). This draws the first screenful at once and
// the rest in low-priority batches, so taps and scrolling stay responsive.
// The count only ever grows: an edit that re-sorts the list must not collapse
// rows the visitor has scrolled past.
export function useProgressiveRows(total: number, scrollKey: string): number {
  const [count, setCount] = useState(() =>
    typeof window === "undefined" ? FIRST_ROWS : firstRowCount(savedScrollY(scrollKey), window.innerHeight)
  );
  const [, startTransition] = useTransition();
  useEffect(() => {
    if (count >= total) return;
    const frame = requestAnimationFrame(() => startTransition(() => setCount((n) => n + ROWS_PER_BATCH)));
    return () => cancelAnimationFrame(frame);
  }, [count, total]);
  return count;
}
