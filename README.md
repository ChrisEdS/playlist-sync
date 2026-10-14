# Playlist Sync

Single-user **Spotify → Tidal** (and optional **Spotify → Spotify 2**) playlist sync for self-hosting on **Vercel** + **Neon**.

Inspired by FreeYourMusic-style workflows — this is an independent open-source project, **not affiliated** with Spotify, Tidal, or FreeYourMusic.

> One deploy = one operator. This is not a multi-tenant SaaS.

## Features

- Source → destination sync by default (Spotify is only read; the target is filled — including a new empty playlist)
- Optional **Mirror** mode (two-way, with a safety brake on mass deletes)
- Optional second Spotify account (Spotify 1 → Spotify 2)
- OAuth keys in **Settings** (encrypted in the database)
- Preview before sync, live progress, sync queue (one pair at a time)
- Rematch unmatched tracks from the pair detail page
- Daily cron on Vercel Hobby (`0 4 * * *`)
- Optional app PIN, or Vercel Deployment Protection (`DISABLE_APP_PIN=1`)

UI language is currently **German**.

## Stack

- Next.js (App Router) on Vercel
- Neon Postgres via Drizzle ORM (local: embedded PGlite)
- Vercel Cron → `/api/cron/sync`
- Background jobs via `waitUntil` (`maxDuration` 300s)

## Quick start (local)

```bash
git clone https://github.com/ChrisEdS/Music_Sync.git
cd Music_Sync
npm install
cp .env.example .env.local
```

Generate secrets and put them in `.env.local`:

```bash
openssl rand -hex 32   # TOKEN_ENCRYPTION_KEY
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # CRON_SECRET
```

Leave `DATABASE_URL` empty for local PGlite (`./data/pglite`).

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → enter PIN if enabled → **Einstellungen** → save Spotify/Tidal developer keys → connect accounts → **+ Playlist paaren**.

## Environment

| Variable | Purpose |
| --- | --- |
| `APP_PIN` | PIN to unlock the UI (local / if PIN enabled) |
| `DISABLE_APP_PIN` | `1` skips app PIN (e.g. Vercel Auth is enough) |
| `APP_URL` | Public URL (`http://localhost:3000` or your Vercel URL) |
| `TOKEN_ENCRYPTION_KEY` | Encrypts OAuth tokens + in-app keys (`openssl rand -hex 32`) |
| `SESSION_SECRET` | Session cookie secret |
| `CRON_SECRET` | Bearer token for `/api/cron/sync` |
| `DATABASE_URL` | Neon URL (empty locally → PGlite) |
| `SPOTIFY_*` / `TIDAL_*` | Optional env fallbacks — prefer **Settings** in the UI |
| `TIDAL_COUNTRY` | Catalog country, default `DE` |

See `.env.example` for a full template.

## Spotify & Tidal developer apps

Also linked from in-app Settings:

1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) → create app  
   Redirect: `{APP_URL}/api/auth/spotify/callback`  
   Typical scopes: playlist read/write, user library (as requested by the app)
2. [Tidal Developer Portal](https://developer.tidal.com/dashboard) → create app  
   Redirect: `{APP_URL}/api/auth/tidal/callback` (authorization code + PKCE)  
   Scopes used: `playlists.read`, `playlists.write`, `collection.read`, `collection.write`, `search.read`, `user.read`
3. Paste Client ID / Secret under **Einstellungen**, then connect

Spotify often needs **Premium** and **Dev Mode** allowlisting for personal apps.

## Deploy on Vercel

1. Fork or import this repo into Vercel (`main`)
2. Set env vars from `.env.example` (at least encryption, session, cron, `APP_URL`)
3. Add **Neon** from the Vercel Marketplace (`DATABASE_URL`)
4. Optionally set `DISABLE_APP_PIN=1` if Deployment Protection covers access
5. After first deploy, run against that database:

   ```bash
   npm run db:push
   ```

6. Register **production** OAuth redirect URIs in Spotify + Tidal
7. Cron is defined in `vercel.ts` (daily on Hobby). Keep `CRON_SECRET` set.

Custom domain → update `APP_URL` and OAuth redirects.

## Sync model

Default mode is **Quelle → Ziel**:

- Spotify (account 1) is the source and is never modified
- Missing tracks are matched and added to Tidal or Spotify 2
- A brand-new empty destination playlist is the normal first copy

**Mirror** keeps both sides aligned (including deletes), with a hold when too many removals would run at once.

Matching prefers ISRC, then title/artist/duration. Unmatched tracks appear on the pair page and can be rematched manually.

Sync jobs run **one after another** (with a short pause) to reduce Spotify/Tidal rate limits (`429`). Prefer syncing a few pairs after a limit, not all at once.

## Project layout

```
src/app           UI + API routes
src/lib/db        Drizzle schema
src/lib/providers Spotify / Tidal clients + encrypted credentials
src/lib/matching  ISRC + fuzzy matching
src/lib/sync      Engine + queue
vercel.ts         Cron config
```

## License

MIT — see [LICENSE](LICENSE).

## Security

See [SECURITY.md](SECURITY.md). Do not open public issues that include secrets, tokens, or `.env` contents.

## Notes

- Not affiliated with Spotify, Tidal, or FreeYourMusic.
- Respect each provider’s developer terms and API rate limits.
- UD Media / PHP shared hosting is not supported.
