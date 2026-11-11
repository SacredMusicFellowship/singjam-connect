"use client";

import { useEffect, useRef, useState } from "react";
import { buildIcs } from "@/lib/ics";

type Props = {
  title: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  description: string | null;
  jamId?: string;
};

function googleUrl({ title, startsAt, endsAt, location, description }: Props): string {
  const end = endsAt ?? new Date(new Date(startsAt).getTime() + 2 * 60 * 60 * 1000).toISOString();
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
  const params = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${fmt(startsAt)}/${fmt(end)}` });
  if (description) params.set("details", description);
  if (location) params.set("location", location);
  return `https://www.google.com/calendar/render?${params}`;
}

function outlookUrl({ title, startsAt, endsAt, location, description }: Props): string {
  const end = endsAt ?? new Date(new Date(startsAt).getTime() + 2 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({ subject: title, startdt: startsAt, enddt: end, path: "/calendar/action/compose", rru: "addevent" });
  if (description) params.set("body", description);
  if (location) params.set("location", location);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
}

function downloadIcs(props: Props) {
  const { title, startsAt, endsAt, location, description, jamId } = props;
  const uid = jamId ? `jam-${jamId}@singjam` : `${Date.now()}@singjam`;
  const ics = buildIcs({ uid, title, startsAt, endsAt, location, description });
  const blob = new Blob([ics], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${title.toLowerCase().replace(/\s+/g, "-")}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function AddToCalendarButton(props: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
      >
        <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
        </svg>
        Add to calendar
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-20 w-48 rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
          <a
            href={googleUrl(props)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50"
            onClick={() => setOpen(false)}
          >
            Google Calendar
          </a>
          <button
            onClick={() => { downloadIcs(props); setOpen(false); }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Apple Calendar
          </button>
          <a
            href={outlookUrl(props)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50"
            onClick={() => setOpen(false)}
          >
            Outlook
          </a>
        </div>
      )}
    </div>
  );
}
