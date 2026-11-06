"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// The YouTube and Spotify players weigh ~1.7 MB and 100+ requests between
// them, so the song page shows a stand-in and loads the real player on tap.
// Same pattern as native's YouTubePlayer.

export function YouTubeEmbed({ videoId, title }: { videoId: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <section className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-200 bg-black">
      {playing ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 h-full w-full"
          aria-label={`Play ${title} on YouTube`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors group-hover:bg-black/10">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/70 transition-colors group-hover:bg-red-600">
              <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 fill-white" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        </button>
      )}
    </section>
  );
}

export function SpotifyEmbed({ trackId, title, subtitle }: { trackId: string; title: string; subtitle?: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="h-20 overflow-hidden rounded-xl border border-slate-200">
      {open ? (
        <iframe
          src={`https://open.spotify.com/embed/track/${trackId}`}
          title={`${title} on Spotify`}
          width="100%"
          height="80"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-full w-full items-center gap-3 bg-white px-4 text-left transition-colors hover:bg-green-50"
          aria-label={`Play ${title} on Spotify`}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-500">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-white" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-slate-900">{title}</span>
            <span className="block truncate text-xs text-slate-500">
              {subtitle ? `${subtitle} · ` : ""}Play on Spotify
            </span>
          </span>
        </button>
      )}
    </section>
  );
}

// Mounts its children only once they come near the viewport. The browser's own
// loading="lazy" starts iframes 1,250–2,500px early, which on a phone is
// usually the whole page.
//
// Near the viewport isn't enough on its own: an event page is short until its
// ticket panel arrives, so for its first second the map sits just below the
// fold before being pushed ~1,300px down. So it loads once the visitor has
// scrolled, or after it has stayed in view for a while on a page that's
// genuinely short.
export function WhenVisible({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    let inView = false;
    let scrolled = window.scrollY > 0;
    let dwell: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        inView = entries.some((e) => e.isIntersecting);
        clearTimeout(dwell);
        if (!inView) return;
        if (scrolled) setVisible(true);
        else dwell = setTimeout(() => setVisible(true), 2000);
      },
      { rootMargin: "200px" }
    );
    const onScroll = () => {
      if (window.scrollY <= 0) return;
      scrolled = true;
      if (inView) setVisible(true);
    };
    observer.observe(el);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      clearTimeout(dwell);
    };
  }, [visible]);
  return (
    <div ref={ref} className={className}>
      {visible ? children : null}
    </div>
  );
}
