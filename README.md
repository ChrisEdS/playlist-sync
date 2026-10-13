# Music Sync

Single-user **Spotify ↔ Tidal** playlist Voll-Sync, inspired by FreeYourMusic. Hosted on **Vercel** with **Neon** Postgres.

## Features

- Private deploy (Vercel Auth / Deployment Protection; optional app PIN)
- Spotify + Tidal OAuth — developer keys can be set in **Settings** (encrypted in Neon)
- Pair playlists; default **additive** sync, optional **mirror** (with confirm before deletes)
- Dry-run preview before applying
- ISRC-first matching with title/artist/duration fallback; unmatched tracks listed per pair
- Dashboard onboarding + pair detail (sync now, disable, unmatched)
- Daily cron sync on Vercel Hobby (`0 4 * * *`)

## Stack

- Next.js (App Router) on Vercel
- Neon Postgres via Drizzle ORM (local: embedded PGlite)
- Vercel Cron → `/api/cron/sync`
- Sync jobs via `waitUntil` + `maxDuration` 300s

## Setup

### 1. Clone & install

```bash
npm install
cp .env.example .env.local
```

### 2. Environment

Fill `.env.local` (and the same core vars in the Vercel project):

| Variable | Purpose |
| --- | --- |
| `APP_PIN` | PIN to unlock the UI (local / if PIN enabled) |
| `DISABLE_APP_PIN` | Set `1` to skip app PIN (e.g. when Vercel Auth is enough) |
| `APP_URL` | Public URL (`http://localhost:3000` locally, your Vercel URL in prod) |
| `TOKEN_ENCRYPTION_KEY` | Long random secret (`openssl rand -hex 32`) |
| `SESSION_SECRET` | Long random secret for session cookies |
| `CRON_SECRET` | Bearer token for cron (`Authorization: Bearer …`) |
| `DATABASE_URL` | Neon connection string (empty locally → PGlite) |
| `SPOTIFY_*` / `TIDAL_*` | Optional env fallbacks — preferred: paste keys in **Settings** |
| `TIDAL_COUNTRY` | Optional catalog country, default `DE` |

### 3. Spotify & Tidal developer apps

Links are also in the in-app Settings:

1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) → create app  
   Redirect URI: `{APP_URL}/api/auth/spotify/callback`
2. [Tidal Developer Portal](https://developer.tidal.com/dashboard) → create app  
   Redirect URI: `{APP_URL}/api/auth/tidal/callback` (authorization code + PKCE)
3. Paste Client ID / Secret under **Settings**, then **Connect account**

Spotify may require Premium + Dev Mode allowlisting for personal use.

### 4. Database

**Local (default):** leave `DATABASE_URL` empty — embedded **PGlite** in `./data/pglite` (auto-migrates).

**Production / Neon:**

```bash
# set DATABASE_URL in .env.local or Vercel, then:
npm run db:push
```

### 5. Run locally

```bash
npm run dev
```

Open `http://localhost:3000`, unlock if PIN is enabled (see `.dev-pin` if generated), complete Settings → Connect → **+ Pair playlist**.

## Deploy on Vercel

1. Import the GitHub repo (`main`) in Vercel
2. Add env vars from `.env.example` (at least encryption, session, cron, `APP_URL`)
3. Add Neon from the Vercel Marketplace (`DATABASE_URL`)
4. Optionally set `DISABLE_APP_PIN=1` if Deployment Protection covers access
5. After first deploy, run `npm run db:push` against that `DATABASE_URL`
6. Register **production** OAuth redirect URIs in Spotify + Tidal
7. Cron is in `vercel.ts` (`0 4 * * *` daily on Hobby). Pro can use `*/15 * * * *`. Keep `CRON_SECRET` set.

Optional: custom domain → update `APP_URL` + OAuth redirects.

## Sync model

For each playlist pair we store a **canonical snapshot** of track keys (ISRC preferred). Each run:

1. Loads Spotify + Tidal membership
2. Diffs each side against the snapshot
3. Builds a desired set (**additive**: only adds; **mirror**: adds + removes)
4. Matches missing tracks on the other service
5. Applies changes and writes a new snapshot

Unmatched tracks are recorded on the pair and do not block the rest.

## Project layout

```
src/app          UI + API routes
src/lib/db       Drizzle schema
src/lib/providers Spotify / Tidal clients + encrypted credentials
src/lib/matching  ISRC + fuzzy matching
src/lib/sync      Snapshot-diff engine + jobs
vercel.ts         Cron config
```

## Notes

- UI inspired by FreeYourMusic-style dashboards for personal self-hosting — not their product code.
- UD Media / PHP shared hosting is not supported; use Vercel.
- Large libraries sync in batches; Hobby cron runs once daily — use **Sync now** anytime.
