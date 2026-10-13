"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProgressBar } from "@/components/ProgressBar";
import { ServiceBadge } from "@/components/ServiceBadge";
import { useStatus } from "@/hooks/useStatus";
import { formatRelativeTime, getPlaylistWebUrl } from "@/lib/format-date";
import { formatApiError } from "@/lib/format-error";

export default function DashboardPage() {
  const { data, error, refresh } = useStatus();
  const setup = data?.setup;
  const pairs = data?.pairs || [];
  const canPair = Boolean(setup?.ready);
  const showOnboarding = Boolean(setup && !setup.hasPairs);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingMap, setSyncingMap] = useState<Record<string, boolean>>({});

  async function syncPair(id: string) {
    setSyncingMap((prev) => ({ ...prev, [id]: true }));
    try {
      await fetch(`/api/pairs/${id}/sync`, { method: "POST" });
      refresh();
    } finally {
      setTimeout(() => {
        setSyncingMap((prev) => ({ ...prev, [id]: false }));
      }, 1000);
    }
  }

  async function syncAll() {
    if (syncingAll) return;
    setSyncingAll(true);
    try {
      await fetch("/api/pairs/sync-all", { method: "POST" });
      refresh();
    } finally {
      setTimeout(() => setSyncingAll(false), 2000);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl p-6 md:p-10">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1
              className="text-3xl font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-syne), sans-serif" }}
            >
              Synchronisierte Playlists
              {data ? ` (${pairs.length})` : ""}
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Spotify ↔ Tidal — Voll-Sync mit automatischer Differenz-Angleichung
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {pairs.length > 0 ? (
              <button
                type="button"
                onClick={syncAll}
                disabled={syncingAll || Boolean(data?.activeJob)}
                className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] px-4 py-3 text-sm font-semibold hover:border-white transition disabled:opacity-40"
              >
                <span className="text-[var(--spotify)]">⇄</span>
                <span>{syncingAll ? "Reiht ein…" : "Alle synchronisieren"}</span>
              </button>
            ) : null}

            {canPair ? (
              <Link
                href="/pairs/new"
                className="inline-flex items-center justify-center rounded-2xl bg-[linear-gradient(120deg,#b8ff57,#1ed760_45%,#ffe56b)] px-5 py-3 font-semibold text-black shadow-[0_10px_40px_rgba(30,215,96,0.25)] hover:brightness-110 transition"
              >
                + Playlist paaren
              </Link>
            ) : (
              <Link
                href="/settings"
                className="inline-flex items-center justify-center rounded-2xl border border-[var(--border)] px-5 py-3 text-sm text-[var(--muted)] hover:border-white hover:text-white transition"
              >
                Setup in Einstellungen abschließen
              </Link>
            )}
          </div>
        </div>

        {/* Active Sync Card */}
        {data?.activeJob ? (
          <div className="mt-6 rounded-3xl border border-[var(--spotify)]/30 bg-[var(--bg-panel)] p-5 shadow-[0_10px_30px_rgba(30,215,96,0.1)]">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--spotify)] font-semibold">
                <span className="h-2 w-2 rounded-full bg-[var(--spotify)] animate-ping" />
                Synchronisierung läuft
              </span>
              <span className="text-xs text-[var(--muted)]">
                {data.activeJob.total > 0
                  ? `${Math.round((data.activeJob.processed / data.activeJob.total) * 100)}%`
                  : "Vorbereitung…"}
              </span>
            </div>
            <p className="mt-2.5 font-semibold text-lg">
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
              <div className="mt-2 flex justify-between text-xs text-[var(--muted)]">
                <span>
                  {data.activeJob.processed} von {data.activeJob.total || "…"} Titeln verarbeitet
                </span>
                <span>{data.activeJob.message || "Gleiche Daten ab…"}</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Onboarding Checklist if no pairs yet */}
        {showOnboarding && setup ? (
          <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-6">
            <h2 className="text-lg font-semibold">Erste Schritte</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Einmalig einrichten — danach bleiben deine Playlists automatisch synchron.
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

        {/* Playlist Pairs List */}
        <div className="mt-6 space-y-3.5">
          {pairs.map((pair, i) => {
            const isSpotifySpotify = pair.pairType === "spotify_spotify";
            const isPairActive =
              pair.status === "syncing" ||
              (data?.activeJob && data.activeJob.pairId === pair.id);
            const isQueued = syncingMap[pair.id];
            const coverUrl = pair.coverImages?.[0];
            const spotifyUrl = getPlaylistWebUrl(
              "spotify",
              pair.spotifyPlaylistId,
              pair.spotifyPlaylistUrl,
            );
            const sideBUrl = isSpotifySpotify
              ? getPlaylistWebUrl("spotify", pair.spotify2PlaylistId, pair.spotify2PlaylistUrl)
              : getPlaylistWebUrl("tidal", pair.tidalPlaylistId, pair.tidalPlaylistUrl);

            return (
              <article
                key={pair.id}
                className={`rise flex flex-col gap-4 rounded-3xl border p-4.5 sm:flex-row sm:items-center sm:justify-between transition ${
                  isPairActive
                    ? "border-[var(--spotify)] bg-[var(--bg-panel)] shadow-[0_0_20px_rgba(30,215,96,0.15)]"
                    : "border-[var(--border)] bg-[var(--bg-panel)]/90 hover:border-white/30"
                }`}
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  {/* Cover Art */}
                  {coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={coverUrl}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-2xl object-cover bg-[#222]"
                    />
                  ) : (
                    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-black/40 text-[var(--muted)] text-xl border border-[var(--border)]">
                      ♫
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={`/pairs/${pair.id}`}
                        className="text-base font-semibold text-white hover:text-[var(--spotify)] transition truncate max-w-md"
                        title={pair.name}
                      >
                        {pair.name}
                      </Link>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="rounded-full bg-black/40 border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted)] uppercase tracking-wider">
                          {pair.syncMode === "mirror"
                            ? "Mirror"
                            : pair.syncMode?.startsWith("one_way")
                              ? "Einweg"
                              : "Additive"}
                        </span>
                        {isPairActive ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--spotify)]/10 border border-[var(--spotify)]/30 px-2 py-0.5 text-xs text-[var(--spotify)] font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--spotify)] animate-ping" />
                            Sync…
                          </span>
                        ) : pair.status === "error" ? (
                          <span className="rounded-full bg-[var(--danger)]/15 border border-[var(--danger)]/40 px-2 py-0.5 text-xs text-[var(--danger)] font-medium">
                            Fehler
                          </span>
                        ) : (
                          <span className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-xs text-[var(--muted)]">
                            Bereit
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Platform links and timestamps */}
                    <div className="mt-2 flex flex-wrap items-center gap-2.5 text-xs text-[var(--muted)]">
                      <span>
                        {pair.songCount} {pair.songCount === 1 ? "Song" : "Songs"}
                      </span>
                      <span>·</span>
                      <div className="flex items-center gap-1.5">
                        <a
                          href={spotifyUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 hover:text-[var(--spotify)] transition"
                          title={`Auf ${isSpotifySpotify ? "Spotify (Account 1)" : "Spotify"} öffnen ↗`}
                        >
                          <ServiceBadge service="spotify" label={isSpotifySpotify ? "Spotify 1" : "Spotify"} />
                          <span className="text-[11px] underline-offset-2 hover:underline">Öffnen ↗</span>
                        </a>
                        <span>·</span>
                        <a
                          href={sideBUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 hover:text-white transition"
                          title={`Auf ${isSpotifySpotify ? "Spotify (Account 2)" : "Tidal"} öffnen ↗`}
                        >
                          {isSpotifySpotify ? (
                            <ServiceBadge service="spotify_2" label="Spotify 2" />
                          ) : (
                            <ServiceBadge service="tidal" />
                          )}
                          <span className="text-[11px] underline-offset-2 hover:underline">Öffnen ↗</span>
                        </a>
                      </div>

                      <span>·</span>
                      <span>Zuletzt: {formatRelativeTime(pair.lastSyncedAt)}</span>
                    </div>

                    {pair.heldRemovals && pair.heldRemovals.length > 0 ? (
                      <p className="mt-2 text-xs text-[var(--accent)] font-medium">
                        Notbremse aktiv: {pair.heldRemovals.length} Löschungen gestoppt —{" "}
                        <Link href={`/pairs/${pair.id}`} className="underline">
                          In Details freigeben
                        </Link>
                      </p>
                    ) : null}

                    {pair.lastError && (!pair.heldRemovals || pair.heldRemovals.length === 0) ? (
                      <p className="mt-2 text-xs text-[var(--danger)] line-clamp-1">
                        {formatApiError(pair.lastError)}
                      </p>
                    ) : null}

                    {pair.unmatchedCount > 0 ? (
                      <p className="mt-1.5 text-xs text-[var(--accent)]">
                        {pair.unmatchedCount} ohne Treffer —{" "}
                        <Link href={`/pairs/${pair.id}`} className="underline">
                          Details ansehen
                        </Link>
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 sm:self-center shrink-0">
                  <button
                    type="button"
                    onClick={() => syncPair(pair.id)}
                    disabled={isPairActive || isQueued}
                    className="rounded-xl border border-[var(--border)] px-3.5 py-2 text-xs font-medium text-white hover:border-[var(--spotify)] hover:text-white transition disabled:opacity-40"
                  >
                    {isPairActive ? "Läuft…" : isQueued ? "Eingereiht" : "Jetzt synchronisieren"}
                  </button>
                  <Link
                    href={`/pairs/${pair.id}`}
                    className="rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/20 hover:border-white transition"
                  >
                    Details
                  </Link>
                </div>
              </article>
            );
          })}

          {!pairs.length && !error && canPair && !showOnboarding ? (
            <div className="rounded-3xl border border-dashed border-[var(--border)] p-12 text-center text-[var(--muted)]">
              <p className="text-base font-medium text-white">Noch keine Playlist-Paare angelegt.</p>
              <p className="mt-1 text-sm">
                Wähle eine Playlist von Spotify oder Tidal, um den Voll-Sync zu starten.
              </p>
              <Link
                href="/pairs/new"
                className="mt-4 inline-flex rounded-2xl bg-[var(--spotify)] px-5 py-2.5 text-sm font-semibold text-black hover:brightness-110 transition"
              >
                + Erste Playlist paaren
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
        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
          done
            ? "border-[var(--progress)]/30 text-[var(--progress)] bg-[rgba(46,229,157,0.05)]"
            : "border-[var(--border)] hover:border-white text-[var(--muted)]"
        }`}
      >
        <span
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold"
          style={{
            background: done ? "rgba(46,229,157,0.2)" : "rgba(255,255,255,0.06)",
          }}
        >
          {done ? "✓" : "·"}
        </span>
        <span className={done ? "text-white" : ""}>{label}</span>
      </Link>
    </li>
  );
}
