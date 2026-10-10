# Music Sync

Single-user **Spotify ↔ Tidal** playlist Voll-Sync, inspired by FreeYourMusic. Hosted on **Vercel** with **Neon** Postgres.

## Features

- Instance PIN lock (private, only you)
- Spotify + Tidal OAuth (tokens encrypted at rest)
- Pair playlists and keep them in bidirectional sync (adds + removes)
- ISRC-first matching with title/artist/duration fallback
- Dashboard with live matching status, progress, and cron sync every 15 minutes

## Stack

- Next.js (App Router) on Vercel Fluid Compute
- Neon Postgres via Drizzle ORM
- Vercel Cron → `/api/cron/sync`
- Sync jobs via `waitUntil` + `maxDuration` 300s

## Setup

### 1. Clone & install

```bash
npm install
cp .env.example .env.local
```

### 2. Environment

Fill `.env.local` (and the same vars in the Vercel project):

| Variable | Purpose |
| --- | --- |
| `APP_PIN` | PIN to unlock the UI |
| `APP_URL` | Public URL (`http://localhost:3000` locally, your Vercel URL in prod) |
| `TOKEN_ENCRYPTION_KEY` | Long random secret (`openssl rand -hex 32`) |
| `SESSION_SECRET` | Long random secret for session cookies |
| `CRON_SECRET` | Bearer token for cron (`Authorization: Bearer …`) |
| `DATABASE_URL` | Neon connection string |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Spotify Developer app |
| `TIDAL_CLIENT_ID` | Tidal Developer app (PKCE) |
| `TIDAL_CLIENT_SECRET` | Only if your Tidal app is confidential |
| `TIDAL_COUNTRY` | Optional catalog country, default `DE` |

### 3. Spotify Developer App

1. Create an app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Add redirect URI: `{APP_URL}/api/auth/spotify/callback`
3. For personal use, Dev Mode + your account allowlisted is enough
4. Spotify may require Premium for Web API access

### 4. Tidal Developer App

1. Create an app at [developer.tidal.com](https://developer.tidal.com)
2. Add redirect URI: `{APP_URL}/api/auth/tidal/callback`
3. Use authorization code + PKCE

### 5. Database

**Local (default):** leave `DATABASE_URL` empty — the app uses embedded **PGlite** in `./data/pglite` (auto-migrates).

**Production / Neon:**

```bash
# set DATABASE_URL in .env.local or Vercel, then:
npm run db:push
```

### 6. Run locally

```bash
npm run dev
```

Open `http://localhost:3000`, enter `APP_PIN` (see `.dev-pin` if generated locally), connect Spotify + Tidal under **Profile**, then **+ New transfer**.

## Deploy on Vercel

1. Push this repo to GitHub and import it in Vercel
2. Add all env vars from `.env.example`
3. Add Neon from the Vercel Marketplace (sets `DATABASE_URL`)
4. Set `APP_URL` to the production URL
5. After first deploy, run `npm run db:push` against that `DATABASE_URL` (or use Drizzle from CI)
6. Register the **production** OAuth redirect URIs in Spotify + Tidal
7. Cron is declared in `vercel.ts` (`*/15 * * * *`). Vercel sends `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is set — keep the same value in project env

Optional: attach a custom domain (e.g. `sync.toxicstyle.de`) and update `APP_URL` + OAuth redirects.

## Sync model

For each playlist pair we store a **canonical snapshot** of track keys (ISRC preferred). Each run:

1. Loads Spotify + Tidal membership
2. Diffs each side against the snapshot
3. Unions adds/removes into a desired set
4. Matches missing tracks on the other service
5. Applies adds/removes and writes a new snapshot

Unmatched tracks are recorded on the job/pair and do not block the rest.

## Project layout

```
src/app          UI + API routes
src/lib/db       Drizzle schema
src/lib/providers Spotify / Tidal clients
src/lib/matching  ISRC + fuzzy matching
src/lib/sync      Snapshot-diff engine + jobs
vercel.ts         Cron config
```

## Notes

- This is **not** a FreeYourMusic clone of their product code — UI is inspired by their dashboard for personal self-hosting.
- UD Media / PHP shared hosting is not supported; use Vercel.
- Rate limits: large libraries sync in batches; cron re-runs every 15 minutes.
