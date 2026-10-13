"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
  const [queueing, setQueueing] = useState(false);
  const [syncingMap, setSyncingMap] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<"name" | "songs" | "recent">("name");
  const [view, setView] = useState<"list" | "tiles">("tiles");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const rateLimited = useMemo(
    () => pairs.filter((p) => (p.lastError || "").includes("429")).length,
    [pairs],
  );
  const groups = useMemo(() => {
    const buckets = new Map<string, typeof pairs>();
    for (const pair of pairs) {
      const key = stateKey(pair);
      const list = buckets.get(key) || [];
      list.push(pair);
      buckets.set(key, list);
    }
    return STATE_ORDER.filter((key) => buckets.has(key)).map((key) => ({
      key,
      label: stateLabel(key),
      pairs: [...(buckets.get(key) || [])].sort((a, b) => comparePairs(a, b, sortBy)),
    }));
  }, [pairs, sortBy]);

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

  async function queueAll() {
    if (queueing) return;
    setQueueing(true);
    try {
      await fetch("/api/pairs/sync-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: (data?.queue?.queued || 0) > 0 }),
      });
      refresh();
    } finally {
      setTimeout(() => setQueueing(false), 2000);
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
              Spotify bleibt die Quelle. Tidal und Spotify 2 werden befüllt.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {pairs.length > 0 ? (
              <button
                type="button"
                onClick={queueAll}
                disabled={queueing || (data?.queue?.running || 0) > 0}
                className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] px-4 py-3 text-sm font-semibold hover:border-white transition disabled:opacity-40"
              >
                <span>
                  {queueing
                    ? "Reiht ein…"
                    : (data?.queue?.running || 0) > 0
                      ? "Warteschlange läuft"
                      : (data?.queue?.queued || 0) > 0
                        ? `${data?.queue?.queued} fortsetzen`
                        : "Nacheinander synchronisieren"}
                </span>
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
            {data.activeJob.status === "queued" ? (
              <>
                <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted)] font-semibold">
                  Warteschlange
                </span>
                <p className="mt-2.5 font-semibold text-lg">
                  {data.activePair?.name || "Nächstes Paar"} wartet
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {data.queue?.queued || 1} Paare sind eingereiht. „Fortsetzen“ startet den nächsten Lauf.
                </p>
              </>
            ) : (
              <>
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
              </>
            )}
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

        {rateLimited > 3 ? (
          <p className="mt-6 rounded-2xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
            Tidal/Spotify hat das API-Limit erreicht ({rateLimited} Playlists). Die Warteschlange
            lässt zwischen den Paaren eine Pause — einzelne Paare erst nach ein paar Minuten starten.
          </p>
        ) : null}

        {pairs.length > 0 ? (
          <div className="mt-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="text-[var(--muted)]">
                Sortieren
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="ml-2 rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] px-2 py-1.5 text-white"
                >
                  <option value="name">Name</option>
                  <option value="songs">Songs</option>
                  <option value="recent">Zuletzt</option>
                </select>
              </label>
              <div className="ml-auto flex rounded-xl border border-[var(--border)] p-0.5">
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className={`rounded-lg px-3 py-1 ${view === "list" ? "bg-white text-black" : "text-[var(--muted)]"}`}
                >
                  Liste
                </button>
                <button
                  type="button"
                  onClick={() => setView("tiles")}
                  className={`rounded-lg px-3 py-1 ${view === "tiles" ? "bg-white text-black" : "text-[var(--muted)]"}`}
                >
                  Kacheln
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-6 space-y-3">
          {groups.map((group) => {
            const storageKey = group.key;
            const open = openGroups[storageKey] ?? group.pairs.length <= 8;
            return (
            <section key={group.key} className="rounded-2xl border border-[var(--border)] bg-black/20">
              <button
                type="button"
                onClick={() =>
                  setOpenGroups((prev) => ({ ...prev, [storageKey]: !open }))
                }
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="text-sm font-semibold text-white">
                  {group.label}
                  <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                    {group.pairs.length}
                  </span>
                </span>
                <span className="text-xs text-[var(--muted)]">{open ? "Einklappen" : "Aufklappen"}</span>
              </button>
              {open ? (
              <div className={`border-t border-[var(--border)] p-3 ${view === "tiles" ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" : "space-y-2"}`}>
                {group.pairs.map((pair) => (
                  <PairRow
                    key={pair.id}
                    pair={pair}
                    view={view}
                    active={
                      pair.status === "syncing" ||
                      Boolean(data?.activeJob && data.activeJob.pairId === pair.id)
                    }
                    queued={Boolean(syncingMap[pair.id])}
                    hideSharedRateLimit={rateLimited > 3}
                    onSync={() => syncPair(pair.id)}
                  />
                ))}
              </div>
              ) : null}
            </section>
            );
          })}
          {!pairs.length && !error && canPair && !showOnboarding ? (
            <div className="rounded-3xl border border-dashed border-[var(--border)] p-12 text-center text-[var(--muted)]">
              <p className="text-base font-medium text-white">Noch keine Playlist-Paare angelegt.</p>
              <p className="mt-1 text-sm">
                Wähle eine Spotify-Playlist als Quelle. Das Ziel auf Tidal darf leer sein.
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

const STATE_ORDER = ["limit", "never", "missing", "error", "ready"];

function stateKey(pair: {
  lastSyncedAt: string | null;
  lastError: string | null;
  unmatchedCount: number;
  status: string;
}) {
  const err = (pair.lastError || "").toLowerCase();
  if (err.includes("429") || err.includes("api-limit") || err.includes("rate limit")) return "limit";
  if (!pair.lastSyncedAt) return "never";
  if ((pair.unmatchedCount || 0) > 0) return "missing";
  if (pair.status === "error" || pair.lastError) return "error";
  return "ready";
}

function stateLabel(key: string) {
  if (key === "limit") return "API-Limit";
  if (key === "never") return "Noch nie synchronisiert";
  if (key === "missing") return "Fehlende Songs";
  if (key === "error") return "Fehler";
  return "Bereit";
}

function comparePairs(
  a: { name: string; songCount: number; lastSyncedAt: string | null },
  b: { name: string; songCount: number; lastSyncedAt: string | null },
  sortBy: "name" | "songs" | "recent",
) {
  if (sortBy === "songs") return b.songCount - a.songCount || a.name.localeCompare(b.name);
  if (sortBy === "recent") {
    const at = a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0;
    const bt = b.lastSyncedAt ? new Date(b.lastSyncedAt).getTime() : 0;
    return bt - at || a.name.localeCompare(b.name);
  }
  return a.name.localeCompare(b.name);
}

function PairRow({
  pair,
  view,
  active,
  queued,
  hideSharedRateLimit,
  onSync,
}: {
  view: "list" | "tiles";
  pair: {
    id: string;
    name: string;
    pairType?: string;
    songCount: number;
    status: string;
    lastSyncedAt: string | null;
    lastError: string | null;
    unmatchedCount: number;
    coverImages: string[] | null;
    spotifyPlaylistId?: string | null;
    tidalPlaylistId?: string | null;
    spotify2PlaylistId?: string | null;
    spotifyPlaylistUrl?: string | null;
    tidalPlaylistUrl?: string | null;
    spotify2PlaylistUrl?: string | null;
    heldRemovals?: Array<{ title: string; artists: string[]; from: string }> | null;
  };
  active: boolean;
  queued: boolean;
  hideSharedRateLimit: boolean;
  onSync: () => void;
}) {
  const spotifySpotify = pair.pairType === "spotify_spotify";
  const cover = pair.coverImages?.[0];
  const spotifyUrl = getPlaylistWebUrl("spotify", pair.spotifyPlaylistId, pair.spotifyPlaylistUrl);
  const sideBUrl = spotifySpotify
    ? getPlaylistWebUrl("spotify", pair.spotify2PlaylistId, pair.spotify2PlaylistUrl)
    : getPlaylistWebUrl("tidal", pair.tidalPlaylistId, pair.tidalPlaylistUrl);
  const sharedLimit = hideSharedRateLimit && (pair.lastError || "").includes("429");

  if (view === "tiles") {
    return (
      <article className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] p-2">
        <Link href={`/pairs/${pair.id}`} className="block">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="aspect-square w-full rounded-xl object-cover" />
          ) : (
            <div className="grid aspect-square w-full place-items-center rounded-xl bg-black/40 text-2xl text-[var(--muted)]">
              ♫
            </div>
          )}
          <p className="mt-2 truncate text-sm font-medium">{pair.name}</p>
        </Link>
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
          <span>{pair.songCount} Songs</span>
          <a href={sideBUrl} target="_blank" rel="noreferrer">
            {spotifySpotify ? <ServiceBadge service="spotify_2" /> : <ServiceBadge service="tidal" />}
          </a>
        </div>
        {pair.status === "error" && !sharedLimit ? (
          <p className="mt-1 line-clamp-2 text-[11px] text-[var(--danger)]">{formatApiError(pair.lastError)}</p>
        ) : null}
        <button
          type="button"
          onClick={onSync}
          disabled={active || queued}
          className="mt-2 rounded-lg border border-[var(--border)] py-1 text-xs disabled:opacity-40"
        >
          {active ? "Läuft" : "Sync"}
        </button>
      </article>
    );
  }

  return (
    <article className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] px-3 py-2.5">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
      ) : (
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-black/40 text-[var(--muted)]">
          ♫
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link href={`/pairs/${pair.id}`} className="truncate font-medium hover:text-[var(--spotify)]">
            {pair.name}
          </Link>
          {active ? (
            <span className="text-xs text-[var(--spotify)]">Sync…</span>
          ) : pair.status === "error" && !sharedLimit ? (
            <span className="text-xs text-[var(--danger)]">Fehler</span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
          <span>{pair.songCount} Songs</span>
          <a href={spotifyUrl} target="_blank" rel="noreferrer">
            <ServiceBadge service="spotify" label={spotifySpotify ? "Spotify 1" : "Spotify"} />
          </a>
          <a href={sideBUrl} target="_blank" rel="noreferrer">
            {spotifySpotify ? (
              <ServiceBadge service="spotify_2" />
            ) : (
              <ServiceBadge service="tidal" />
            )}
          </a>
          <span>{formatRelativeTime(pair.lastSyncedAt)}</span>
        </div>
        {pair.heldRemovals?.length ? (
          <p className="mt-1 text-xs text-[var(--accent)]">
            {pair.heldRemovals.length} Löschungen gestoppt
          </p>
        ) : null}
        {pair.lastError && !sharedLimit && !pair.heldRemovals?.length ? (
          <p className="mt-1 line-clamp-1 text-xs text-[var(--danger)]">
            {formatApiError(pair.lastError)}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onSync}
        disabled={active || queued}
        className="shrink-0 rounded-xl border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-40"
      >
        {active ? "Läuft" : queued ? "…" : "Sync"}
      </button>
    </article>
  );
}
