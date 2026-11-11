import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// inside.singjam.org serves the blog at its root: /<slug> is /blog/<slug>.
// Every other top-level app route (read from app/ so new ones are covered)
// is sent to singjam.org, where the visitor's session cookies live. api/
// stays on this host because pages call it same-origin.
const blogHost = [{ type: "host", value: "inside\\.(singjam\\.org|localhost)" }];
const appRoutes = fs
  .readdirSync(path.join(__dirname, "app"))
  .map((name) => name.replace(/\.[^.]+$/, ""))
  .filter((name) => /^[a-z0-9-]+$/.test(name) && name !== "api");
const blogSlug = `(?!(?:${appRoutes.join("|")})$)[a-z0-9]+(?:-[a-z0-9]+)*`;

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : "*.supabase.co";

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../..'),
  reactStrictMode: true,
  devIndicators: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" },
      // Google OAuth avatars
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },
  async redirects() {
    return [
      { source: "/blog", has: blogHost, destination: "/", permanent: true },
      { source: "/blog/:slug", has: blogHost, destination: "/:slug", permanent: true },
      {
        source: `/:route(${appRoutes.filter((r) => r !== "blog").join("|")})/:rest*`,
        has: blogHost,
        destination: "https://singjam.org/:route/:rest*",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", has: blogHost, destination: "/blog" },
        { source: `/:slug(${blogSlug})`, has: blogHost, destination: "/blog/:slug" },
      ],
    };
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // The home page renders identical anonymous HTML for everyone (auth is
        // resolved client-side), so it is safe to share-cache. This relies on
        // Netlify's CDN not storing responses that carry a Set-Cookie header —
        // middleware may emit one when refreshing a logged-in user's session.
        source: "/",
        headers: [
          { key: "Cache-Control", value: "public, max-age=60, s-maxage=60, stale-while-revalidate=3600" },
        ],
      },
      {
        // Only routes whose server-rendered HTML is personalized or auth-flow
        // sensitive stay no-store: /admin SSRs the signed-in user's role and
        // review counts; /auth renders invite/error params and hosts the
        // password-reset flow. Every other formerly listed route (/repertoire,
        // /friends, /jams, /profile, /account, /notifications, /matches,
        // /search) is a statically prerendered shell — built with no user
        // context, data fetched client-side — so it inherits the default
        // static-page caching and the CDN can serve it. Auth gating for those
        // shells lives in middleware, which runs before the CDN cache.
        source: "/(auth|admin)(.*)",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};
export default nextConfig;
