# Playlist Sync

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-pink?logo=github)](https://github.com/sponsors/ChrisEdS)

Single-user **Spotify ↔ Tidal** playlist sync (optional **Spotify 1 ↔ Spotify 2**) for self-hosting on **Vercel** + **Neon**.

Inspired by FreeYourMusic-style workflows — independent open source, **not affiliated** with Spotify, Tidal, or FreeYourMusic.

> One deploy = one operator. Not a multi-tenant SaaS.

German UI.

## Sponsor this project

If Playlist Sync helps you, you can support development via **GitHub Sponsors**:

**[♥ Sponsor @ChrisEdS](https://github.com/sponsors/ChrisEdS)**

The repo also shows GitHub’s built-in **Sponsor** button (via [`.github/FUNDING.yml`](.github/FUNDING.yml)). In the app, the same link appears as **Unterstützen** in the sidebar and under **Einstellungen**. Forks can override it with `NEXT_PUBLIC_DONATION_URL`.

## Features

- **Quelle → Ziel** in either direction
  - Spotify → Tidal **or** Tidal → Spotify
  - Spotify 1 → Spotify 2 **or** Spotify 2 → Spotify 1
  - Source is read-only; destination may start empty; **no deletes** in this mode
- **Mirror** (two-way, including deletes) with a safety brake on mass removals
- Pair creation: link existing playlists by name, or create the destination playlist
- Preview before sync, live progress, rematch for unmatched tracks
- Sync **queue** (one pair at a time, gaps after rate limits)
- OAuth Client ID/Secret in **Einstellungen** (encrypted in the DB)
- Optional second Spotify account (same Spotify developer app, second OAuth connect)
- Batch-link playlists already present on both sides; M3U8/CSV export per pair
- Daily Vercel cron **04:00 UTC** (`0 4 * * *` on Hobby) — only pairs with **Täglicher Cron** enabled
- Optional app PIN, or `DISABLE_APP_PIN=1` with Vercel Deployment Protection

## Stack

- Next.js (App Router) on Vercel
- Neon Postgres via Drizzle ORM (local: embedded PGlite in `./data/pglite`)
- Cron → `/api/cron/sync`
- Background jobs via `waitUntil` (`maxDuration` 300s)

## Quick start (local)

```bash
git clone https://github.com/ChrisEdS/playlist-sync.git
cd playlist-sync
npm install
cp .env.example .env.local
```

Generate secrets into `.env.local`:

```bash
openssl rand -hex 32   # TOKEN_ENCRYPTION_KEY
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # CRON_SECRET
```

Leave `DATABASE_URL` empty for local PGlite.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → PIN if enabled → **Einstellungen** → save Spotify/Tidal developer keys → connect accounts → **+ Playlist paaren** → pick direction (**Spotify → Tidal** or **Tidal → Spotify**).

## Environment

| Variable | Purpose |
| --- | --- |
| `APP_PIN` | PIN to unlock the UI (unused when `DISABLE_APP_PIN=1`) |
| `DISABLE_APP_PIN` | `1` skips app PIN (e.g. Vercel Auth enough) |
| `APP_URL` | Public URL (OAuth redirects) |
| `TOKEN_ENCRYPTION_KEY` | Encrypts OAuth tokens + in-app keys |
| `SESSION_SECRET` | Session cookie secret (falls back to `TOKEN_ENCRYPTION_KEY` if unset) |
| `CRON_SECRET` | **Required in production** — Bearer for `/api/cron/sync` (401 without it) |
| `DATABASE_URL` | Neon URL (empty locally → PGlite, which auto-migrates) |
| `SPOTIFY_*` / `TIDAL_*` | Optional env fallbacks — prefer **Settings** in the UI |
| `TIDAL_COUNTRY` | Catalog country, default `DE` |
| `NEXT_PUBLIC_DONATION_URL` | Optional override for **Unterstützen** (default: GitHub Sponsors) |

See [`.env.example`](.env.example).

## Spotify & Tidal developer apps

Linked from in-app Settings:

1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) → create **one** app (also used for Spotify 2)  
   Redirect: `{APP_URL}/api/auth/spotify/callback`  
   Scopes requested at connect: `playlist-read-private`, `playlist-read-collaborative`, `playlist-modify-public`, `playlist-modify-private`, `user-library-read`
2. [Tidal Developer Portal](https://developer.tidal.com/dashboard) → create app  
   Redirect: `{APP_URL}/api/auth/tidal/callback` (authorization code + PKCE; client **secret often optional**)  
   Scopes: `playlists.read`, `playlists.write`, `collection.read`, `collection.write`, `search.read`, `user.read`
3. Paste Client ID / Secret under **Einstellungen**, then connect (Spotify 2 = connect again and pick the other account)

Spotify often needs **Premium** and **Dev Mode** allowlisting for personal apps.

## Deploy on Vercel

1. Fork or import [ChrisEdS/playlist-sync](https://github.com/ChrisEdS/playlist-sync) (`main`)
2. Set env vars from `.env.example` (encryption, session, cron, `APP_URL`)
3. Add **Neon** from the Vercel Marketplace (`DATABASE_URL`)
4. Optionally `DISABLE_APP_PIN=1` if Deployment Protection covers access (then `APP_PIN` is unused)
5. **Schema:** local PGlite migrates automatically; **Neon does not** — after first deploy run with `DATABASE_URL` set:

   ```bash
   npm run db:push
   ```

6. Register **production** OAuth redirect URIs in Spotify + Tidal
7. Cron lives in `vercel.ts` (**04:00 UTC**, once/day on Hobby). Set `CRON_SECRET` or cron calls get `401`.

Custom domain → update `APP_URL` and OAuth redirects.

## Sync model

**Quelle → Ziel** (default): pick direction per pair. Only missing tracks are added to the destination. An empty destination on first copy is intentional. Nothing is deleted.

**Mirror**: both sides converge (adds + deletes). If more than **20** removals would run at once, a hold stops mass deletes until you confirm on the pair page.

**Empty-source guard:** after a pair has already synced, an empty track list from the **source** side aborts the run (likely API glitch) so the other side is not wiped. That is different from a brand-new empty destination.

Matching: ISRC, then title/artist/duration. Unmatched tracks show on the pair page for rematch into the **current destination** catalog.

Jobs run **sequentially** (short gap between pairs; longer after `429`) with `maxDuration` **300s**. Very large libraries can time out — sync fewer pairs after rate limits, not everything at once. Daily cron only processes pairs with cron enabled.

## Project layout

```
src/app           UI + API routes
src/lib/db        Drizzle schema
src/lib/providers Spotify / Tidal clients + encrypted credentials
src/lib/matching  ISRC + fuzzy matching
src/lib/sync      Engine + queue + modes
vercel.ts         Cron config
.github/FUNDING.yml   GitHub Sponsors button
```

## License

MIT — see [LICENSE](LICENSE).

## Security

See [SECURITY.md](SECURITY.md). Do not open public issues that include secrets, tokens, or `.env` contents.

## Notes

- Not affiliated with Spotify, Tidal, or FreeYourMusic.
- Respect each provider’s developer terms and API rate limits.
- UD Media / PHP shared hosting is not supported.
