# Security

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems.

Email the maintainer privately (GitHub profile / commit author) with:

- a short description of the issue
- steps to reproduce
- impact (e.g. token exposure, auth bypass)

## What this app stores

Playlist Sync is a **single-user self-hosted** app. Each deploy is meant for one operator.

Encrypted at rest in your database (when `TOKEN_ENCRYPTION_KEY` is set):

- Spotify / Tidal OAuth tokens
- optional in-app developer Client ID / Secret

Not encrypted as application secrets (configure via env / host secrets):

- `TOKEN_ENCRYPTION_KEY`, `SESSION_SECRET`, `CRON_SECRET`, `APP_PIN`, `DATABASE_URL`

## Hardening checklist

1. Generate strong secrets: `openssl rand -hex 32`
2. Never commit `.env.local`, `.dev-pin`, or real API keys
3. Prefer Vercel Deployment Protection **or** keep `APP_PIN` enabled (`DISABLE_APP_PIN` unset)
4. Keep `CRON_SECRET` set so `/api/cron/sync` is not publicly callable
5. Rotate OAuth apps / encryption keys if you suspect a leak
6. Restrict who can access your Vercel project and Neon database

## Scope

This project is not a multi-tenant SaaS. Do not expose one instance to untrusted users without additional authentication and isolation.
