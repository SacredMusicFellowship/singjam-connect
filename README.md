# singjam-connect

A platform for musicians to find jam partners based on shared repertoire.

Musicians add songs they know to their repertoire, rate their confidence on each one, and get matched with nearby players who know the same songs. From there they can host or join jams, invite others, and build a local music community.

## Features

- **Repertoire** — Add songs you know and rate your confidence: lead, support, follow, or want to learn
- **Matching** — Get matched with other musicians based on songs you have in common
- **Jams** — Create and manage jam sessions, invite matched musicians, track RSVPs
- **Profiles** — Set your instruments, roles, vibe, comfort level, and neighbourhood

## Tech stack

- [Next.js 15](https://nextjs.org) (App Router)
- [Supabase](https://supabase.com) (Postgres, Auth, RLS)
- [Tailwind CSS](https://tailwindcss.com)
- [Netlify](https://netlify.com) (hosting)

## Getting started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- A [Netlify](https://netlify.com) account (for deployment)

### Local setup

1. Clone the repo
   ```bash
   git clone https://github.com/bkramarz/singjam-connect.git
   cd singjam-connect
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Set up environment variables — create a `.env.local` file:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```
   Find these in your Supabase dashboard under **Project Settings → API**.

4. Run the database migration
   ```bash
   supabase link --project-ref your-project-ref
   supabase db push
   ```

5. Start the dev server
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

## Contributing

This is an open source project. All contributions are welcome.

- Read [CLAUDE.md](CLAUDE.md) before starting — it covers branching, commit style, code standards, and PR requirements
- All work must be done in a new branch; never commit directly to `main`
- Open a pull request and fill in the template

## License

MIT
