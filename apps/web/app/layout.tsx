import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import MobileHeaderProfile from "@/components/MobileHeaderProfile";
import ProfileProvider from "@/components/ProfileProvider";
import { devGuardOn } from "@/lib/devSafety";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://singjam.org"),
  title: {
    default: "SingJam",
    template: "%s | SingJam",
  },
  description: "Find your people through shared music. Build your repertoire, discover musicians nearby, and get invited to jams in your community.",
  openGraph: {
    siteName: "SingJam",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    site: "@singjamorg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <head>
        {/* Supabase queries are anonymous CORS fetches, so the preconnect
            must be crossOrigin="anonymous" to warm the connection they use. */}
        <link
          rel="preconnect"
          href={process.env.NEXT_PUBLIC_SUPABASE_URL}
          crossOrigin="anonymous"
        />
      </head>
      {/* overflow-anchor off: client-fetched pages grow after navigation's
          scroll reset, and browser scroll anchoring re-scrolls toward the
          footer (song pages landed scrolled-down on mobile) */}
      <body className="min-h-screen bg-slate-50 [overflow-anchor:none]">
        {devGuardOn() && (
          <div className="bg-amber-200 px-4 py-1 text-center text-xs font-medium text-amber-900">
            Local dev: emails and payments are disabled
          </div>
        )}
        <ProfileProvider>
        <header className="sticky top-0 z-10 bg-slate-900">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-white">SingJam</span>
            </Link>

            <div className="hidden sm:flex">
              <TopNav />
            </div>
            <MobileHeaderProfile />
          </div>
        </header>

        <div className="overflow-x-clip">
        <main className="mx-auto max-w-4xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">{children}</main>

        <footer className="mx-auto max-w-4xl px-6 py-8 pb-24 sm:py-10 sm:pb-10">
          <div className="border-t border-slate-200 pt-6 text-xs text-slate-400 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <span>© {new Date().getFullYear()} SingJam · Music. Community. Love.</span>
            <div className="flex flex-wrap gap-4">
              <Link href="/feedback" className="hover:text-slate-600">Report a bug</Link>
              <Link href="/privacy" className="hover:text-slate-600">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-slate-600">Terms of Service</Link>
              <a href="https://sacredmusicfellowship.org/" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600">About Us</a>
              <a href="https://www.instagram.com/sacredmusic1" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600">Follow Us</a>
            </div>
          </div>
        </footer>
        </div>

        <BottomNav />
        </ProfileProvider>
      </body>
    </html>
  );
}
