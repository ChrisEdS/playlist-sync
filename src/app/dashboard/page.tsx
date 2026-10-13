"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ProgressBar } from "@/components/ProgressBar";
import { ServiceBadge } from "@/components/ServiceBadge";
import { useStatus } from "@/hooks/useStatus";

export default function DashboardPage() {
  const { data, error, refresh } = useStatus();
  const setup = data?.setup;
  const pairs = data?.pairs || [];
  const canPair = Boolean(setup?.ready);
  const showOnboarding = Boolean(setup && !setup.hasPairs);

  async function syncPair(id: string) {
    await fetch(`/api/pairs/${id}/sync`, { method: "POST" });
    refresh();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl p-6 md:p-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1
              className="text-3xl font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-syne), sans-serif" }}
            >
              Synced Playlists
              {data ? ` (${pairs.length})` : ""}
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Spotify ↔ Tidal — standard Additive, optional Mirror
            </p>
          </div>
          {canPair ? (
            <Link
              href="/pairs/new"
              className="inline-flex items-center justify-center rounded-2xl bg-[linear-gradient(120deg,#b8ff57,#1ed760_45%,#ffe56b)] px-5 py-3 font-semibold text-black shadow-[0_10px_40px_rgba(30,215,96,0.25)]"
            >
              + Playlist paaren
            </Link>
          ) : (
            <Link
              href="/settings"
              className="inline-flex items-center justify-center rounded-2xl border border-[var(--border)] px-5 py-3 text-sm text-[var(--muted)] hover:border-white hover:text-white"
            >
              Setup in Einstellungen abschließen
            </Link>
          )}
        </div>

        {data?.activeJob ? (
          <div className="mt-6 rounded-3xl border border-[var(--spotify)]/30 bg-[var(--bg-panel)] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
              Sync läuft
            </p>
            <p className="mt-2 font-semibold">
              {data.activePair?.name || data.activeJob.currentTrack || "Playlist-Sync"}
            </p>
            <div className="mt-3">
              <ProgressBar
                value={
                  data.activeJob.total > 0
                    ? Math.round((data.activeJob.processed / data.activeJob.total) * 100)
                    : 0
                }
              />
              <p className="mt-2 text-sm text-[var(--muted)]">
                {data.activeJob.processed}/{data.activeJob.total || "…"}
                {data.activeJob.message ? ` · ${data.activeJob.message}` : ""}
              </p>
            </div>
          </div>
        ) : null}

        {showOnboarding && setup ? (
          <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-6">
            <h2 className="text-lg font-semibold">Loslegen</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Einmalig — danach bleiben deine Paare hier synchron.
            </p>
            <ul className="mt-5 space-y-3">
              <OnboardingStep
                done={setup.spotifyKeys}
                href="/settings"
                label="Spotify Developer-Keys speichern"
              />
              <OnboardingStep
                done={setup.tidalKeys}
                href="/settings"
                label="Tidal Developer-Keys speichern"
              />
              <OnboardingStep
                done={setup.spotifyConnected}
                href="/settings"
                label="Spotify-Account verbinden"
              />
              <OnboardingStep
                done={setup.tidalConnected}
                href="/settings"
                label="Tidal-Account verbinden"
              />
              <OnboardingStep
                done={setup.hasPairs}
                href={canPair ? "/pairs/new" : "/settings"}
                label={
                  canPair
                    ? "Erste Playlist paaren"
                    : "Zuerst Accounts verbinden (Einstellungen)"
                }
              />
            </ul>
          </div>
        ) : null}

        {error ? (
          <p className="mt-6 rounded-2xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 p-4 text-sm">
            {error}
          </p>
        ) : null}

        <div className="mt-6 space-y-3">
          {pairs.map((pair, i) => (
            <article
              key={pair.id}
              className="rise flex flex-col gap-4 rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)]/90 p-4 md:flex-row md:items-center md:justify-between"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
              <Link href={`/pairs/${pair.id}`} className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="truncate text-lg font-semibold">{pair.name}</h3>
                  <span className="text-sm text-[var(--muted)]">{pair.songCount} songs</span>
                  <span className="rounded-full bg-black/40 px-2 py-0.5 text-xs text-[var(--muted)]">
                    {pair.syncMode === "mirror" ? "Mirror" : "Additive"}
                  </span>
                  {pair.status === "syncing" ? (
                    <span className="inline-flex items-center gap-2 text-sm text-[var(--spotify)]">
                      <span className="h-2 w-2 rounded-full bg-[var(--spotify)]" />
                      Syncing
                    </span>
                  ) : pair.status === "error" ? (
                    <span className="text-sm text-[var(--danger)]">Error</span>
                  ) : (
                    <span className="text-sm text-[var(--muted)]">Idle</span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <ServiceBadge service="spotify" />
                  <ServiceBadge service="tidal" />
                </div>
                {pair.lastError ? (
                  <p className="mt-2 text-xs text-[var(--danger)] line-clamp-2">{pair.lastError}</p>
                ) : null}
                  {pair.unmatchedCount > 0 ? (
                    <p className="mt-1 text-xs text-[var(--accent)]">
                      {pair.unmatchedCount} unmatched — Details öffnen
                    </p>
                  ) : null}
                </Link>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => syncPair(pair.id)}
                    className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--spotify)]"
                  >
                    Sync now
                  </button>
                  <Link
                    href={`/pairs/${pair.id}`}
                    className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black"
                  >
                    Details
                  </Link>
                </div>
              </article>
            ))}

          {!pairs.length && !error && canPair && !showOnboarding ? (
            <div className="rounded-3xl border border-dashed border-[var(--border)] p-10 text-center text-[var(--muted)]">
              Noch keine Playlist-Paare.{" "}
              <Link href="/pairs/new" className="text-[var(--spotify)]">
                Erste Playlist paaren
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

function OnboardingStep({
  done,
  href,
  label,
}: {
  done: boolean;
  href: string;
  label: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${
          done
            ? "border-[var(--progress)]/30 text-[var(--progress)]"
            : "border-[var(--border)] hover:border-white"
        }`}
      >
        <span
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs"
          style={{
            background: done ? "rgba(46,229,157,0.2)" : "rgba(255,255,255,0.06)",
          }}
        >
          {done ? "✓" : "·"}
        </span>
        {label}
      </Link>
    </li>
  );
}
