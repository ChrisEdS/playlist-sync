"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ServiceBadge } from "@/components/ServiceBadge";
import { formatApiError } from "@/lib/format-error";
import { formatRelativeTime, getPlaylistWebUrl } from "@/lib/format-date";

type Plan = {
  syncMode: string;
  addToSpotify: number;
  addToTidal: number;
  removeFromSpotify: number;
  removeFromTidal: number;
  sampleAdds: Array<{ title: string; artists: string[]; to: string }>;
  sampleRemoves: Array<{ title: string; artists: string[]; from: string }>;
};

type Pair = {
  id: string;
  name: string;
  spotifyPlaylistId: string;
  tidalPlaylistId: string;
  spotifyPlaylistUrl?: string | null;
  tidalPlaylistUrl?: string | null;
  syncMode: string;
  enabled: number;
  status: string;
  songCount: number;
  unmatchedCount: number;
  lastError: string | null;
  lastSyncedAt: string | null;
  unmatchedTracks?: Array<{ title: string; artists: string[]; side: string }> | null;
};

type SyncJob = {
  id: string;
  status: string;
  total: number;
  processed: number;
  matched: number;
  unmatched: number;
  addedSpotify: number;
  addedTidal: number;
  removedSpotify: number;
  removedTidal: number;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
};

function PairDetailInner() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const [pair, setPair] = useState<Pair | null>(null);
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmMirror, setConfirmMirror] = useState(false);
  const [showAllAdds, setShowAllAdds] = useState(false);
  const [showAllRemoves, setShowAllRemoves] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/pairs/${id}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed");
    setPair(json.pair);
    setJobs(json.jobs || []);
  }, [id]);

  useEffect(() => {
    load()
      .catch((e) => setError(formatApiError(e)))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (search.get("preview") === "1" && pair) {
      void runPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair?.id, search]);

  async function runPreview() {
    setPreviewing(true);
    setError(null);
    try {
      const res = await fetch(`/api/pairs/${id}/preview`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(formatApiError(json.error || "Vorschau fehlgeschlagen"));
      setPlan(json.plan);
    } catch (e) {
      setError(formatApiError(e, "Vorschau fehlgeschlagen"));
    } finally {
      setPreviewing(false);
    }
  }

  async function startSync(opts?: { forceMirror?: boolean }) {
    if (pair?.syncMode === "mirror" && !opts?.forceMirror) {
      setConfirmMirror(true);
      return;
    }
    setSyncing(true);
    setError(null);
    setConfirmMirror(false);
    try {
      const res = await fetch(`/api/pairs/${id}/sync`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(formatApiError(json.error || "Sync fehlgeschlagen"));
      router.replace(`/pairs/${id}`);
      await load();
    } catch (e) {
      setError(formatApiError(e, "Sync fehlgeschlagen"));
    } finally {
      setSyncing(false);
    }
  }

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/pairs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (res.ok) setPair(json.pair);
  }

  async function removePair() {
    if (!confirm("Dieses Playlist-Paar entfernen? Deine Playlists auf Spotify und Tidal bleiben unberührt.")) {
      return;
    }
    await fetch(`/api/pairs/${id}`, { method: "DELETE" });
    router.push("/dashboard");
  }

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl p-6 md:p-10 space-y-4 animate-pulse">
          <div className="h-4 w-32 bg-white/5 rounded" />
          <div className="h-8 w-64 bg-white/10 rounded" />
          <div className="h-40 bg-[var(--bg-panel)] rounded-3xl" />
        </div>
      </AppShell>
    );
  }

  if (!pair) {
    return (
      <AppShell>
        <div className="p-10 text-[var(--danger)]">
          <p>{error || "Playlist-Paar nicht gefunden"}</p>
          <Link href="/dashboard" className="mt-4 inline-block text-white underline">
            Zurück zu Playlists
          </Link>
        </div>
      </AppShell>
    );
  }

  const spotifyUrl = getPlaylistWebUrl("spotify", pair.spotifyPlaylistId, pair.spotifyPlaylistUrl);
  const tidalUrl = getPlaylistWebUrl("tidal", pair.tidalPlaylistId, pair.tidalPlaylistUrl);

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl p-6 md:p-10">
        <Link href="/dashboard" className="text-xs text-[var(--muted)] hover:text-white transition flex items-center gap-1.5">
          <span>←</span>
          <span>Zurück zu den Playlists</span>
        </Link>

        {/* Title Header */}
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1
              className="text-3xl font-semibold tracking-tight text-white"
              style={{ fontFamily: "var(--font-syne), sans-serif" }}
            >
              {pair.name}
            </h1>

            {/* Direct Platform links & Badges */}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <a
                href={spotifyUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-black/40 px-3 py-1 text-xs hover:border-[var(--spotify)] transition"
                title="Auf Spotify öffnen ↗"
              >
                <ServiceBadge service="spotify" />
                <span className="text-white font-medium">Spotify öffnen ↗</span>
              </a>

              <a
                href={tidalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-black/40 px-3 py-1 text-xs hover:border-[var(--tidal)] transition"
                title="Auf Tidal öffnen ↗"
              >
                <ServiceBadge service="tidal" />
                <span className="text-white font-medium">Tidal öffnen ↗</span>
              </a>

              <span className="rounded-full bg-black/40 px-2.5 py-1 text-xs text-[var(--muted)] border border-[var(--border)] uppercase tracking-wider text-[10px]">
                {pair.syncMode === "mirror" ? "Mirror-Sync" : "Additive-Sync"}
              </span>

              <span className="text-xs text-[var(--muted)]">
                {pair.songCount} {pair.songCount === 1 ? "Song" : "Songs"}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={runPreview}
              disabled={previewing}
              className="rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] px-4 py-2.5 text-sm font-semibold hover:border-white transition disabled:opacity-40"
            >
              {previewing ? "Prüfe Änderungen…" : "Differenz-Vorschau"}
            </button>
            <button
              onClick={() => void startSync()}
              disabled={syncing}
              className="rounded-2xl bg-[var(--spotify)] px-5 py-2.5 text-sm font-semibold text-black hover:brightness-110 transition disabled:opacity-40 shadow-[0_10px_30px_rgba(30,215,96,0.2)]"
            >
              {syncing ? "Synchronisiere…" : "Jetzt synchronisieren"}
            </button>
          </div>
        </div>

        {/* Warning if Mirror deletes */}
        {confirmMirror ? (
          <div className="mt-5 rounded-2xl border border-[var(--danger)]/50 bg-[var(--danger)]/10 p-5 text-sm">
            <p className="font-semibold text-[var(--danger)]">Mirror-Modus wird Titel entfernen</p>
            <p className="mt-1 text-[var(--muted)]">
              Im Mirror-Modus werden Songs, die auf einer Seite gelöscht wurden, auch auf der anderen Seite entfernt. Fortfahren?
            </p>
            <div className="mt-3 flex gap-2.5">
              <button
                onClick={() => void startSync({ forceMirror: true })}
                className="rounded-xl bg-[var(--danger)] px-4 py-2 text-xs font-semibold text-white hover:brightness-110 transition"
              >
                Ja, im Mirror-Modus synchronisieren
              </button>
              <button
                onClick={() => setConfirmMirror(false)}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs text-white hover:border-white transition"
              >
                Abbrechen
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}

        {/* Dry-Run / Preview Card */}
        {plan ? (
          <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base text-white">
                Erkannte Differenzen ({plan.syncMode === "mirror" ? "Mirror" : "Additive"})
              </h2>
              <span className="text-xs text-[var(--muted)]">
                {plan.addToSpotify + plan.addToTidal + plan.removeFromSpotify + plan.removeFromTidal === 0
                  ? "Beide Seiten identisch"
                  : "Änderungen anstehend"}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="Zu Spotify hinzufügen" value={plan.addToSpotify} />
              <Stat label="Zu Tidal hinzufügen" value={plan.addToTidal} />
              <Stat label="Von Spotify entfernen" value={plan.removeFromSpotify} danger />
              <Stat label="Von Tidal entfernen" value={plan.removeFromTidal} danger />
            </div>

            {/* List of additions */}
            {plan.sampleAdds.length ? (
              <div className="mt-5 pt-4 border-t border-[var(--border)]">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wider text-[var(--progress)] font-semibold">
                    Geplante Hinzufügungen ({plan.sampleAdds.length})
                  </p>
                  {plan.sampleAdds.length > 8 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllAdds((v) => !v)}
                      className="text-xs text-[var(--muted)] hover:text-white underline"
                    >
                      {showAllAdds ? "Weniger anzeigen" : `Alle ${plan.sampleAdds.length} anzeigen`}
                    </button>
                  ) : null}
                </div>

                <ul className="mt-2.5 space-y-1.5 text-xs max-h-60 overflow-auto pr-1">
                  {(showAllAdds ? plan.sampleAdds : plan.sampleAdds.slice(0, 8)).map((t, i) => (
                    <li key={i} className="flex items-center justify-between p-2 rounded-lg bg-black/20">
                      <span className="truncate text-white">
                        <strong className="font-medium">{t.title}</strong> — {t.artists.join(", ")}
                      </span>
                      <span className="shrink-0 text-[var(--muted)] ml-2">
                        → {t.to === "spotify" ? "Spotify" : "Tidal"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* List of removals */}
            {plan.sampleRemoves.length ? (
              <div className="mt-4 pt-3 border-t border-[var(--border)]">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wider text-[var(--danger)] font-semibold">
                    Geplante Entfernungen ({plan.sampleRemoves.length})
                  </p>
                  {plan.sampleRemoves.length > 8 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllRemoves((v) => !v)}
                      className="text-xs text-[var(--muted)] hover:text-white underline"
                    >
                      {showAllRemoves ? "Weniger anzeigen" : `Alle ${plan.sampleRemoves.length} anzeigen`}
                    </button>
                  ) : null}
                </div>

                <ul className="mt-2.5 space-y-1.5 text-xs max-h-60 overflow-auto pr-1">
                  {(showAllRemoves ? plan.sampleRemoves : plan.sampleRemoves.slice(0, 8)).map((t, i) => (
                    <li key={i} className="flex items-center justify-between p-2 rounded-lg bg-black/20">
                      <span className="truncate text-white">
                        <strong className="font-medium">{t.title}</strong> — {t.artists.join(", ")}
                      </span>
                      <span className="shrink-0 text-[var(--danger)] ml-2">
                        von {t.from === "spotify" ? "Spotify" : "Tidal"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Pair Configuration & Unmatched Tracks Grid */}
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {/* Settings Panel */}
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-5.5">
            <h2 className="font-semibold text-base text-white">Einstellungen</h2>

            <label className="mt-4 flex items-center gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={pair.enabled === 1}
                onChange={(e) => patch({ enabled: e.target.checked })}
                className="accent-[var(--spotify)]"
              />
              <span className="text-white">Im automatischen täglichen Cron-Sync berücksichtigen</span>
            </label>

            <div className="mt-4.5">
              <p className="text-xs text-[var(--muted)] uppercase tracking-wider font-medium">Modus</p>
              <select
                className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--spotify)]"
                value={pair.syncMode || "additive"}
                onChange={(e) => patch({ syncMode: e.target.value })}
              >
                <option value="additive">Additive (Nur hinzufügen, keine Löschungen)</option>
                <option value="mirror">Mirror (Vollständige Spiegelung inkl. Löschungen)</option>
              </select>
            </div>

            <div className="mt-4.5 text-xs text-[var(--muted)] space-y-1">
              <p>Zuletzt synchronisiert: {formatRelativeTime(pair.lastSyncedAt)}</p>
              {pair.lastError ? (
                <p className="text-[var(--danger)]">Fehler: {pair.lastError}</p>
              ) : null}
            </div>

            <div className="mt-6 pt-4 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={removePair}
                className="text-xs text-[var(--danger)] hover:underline"
              >
                Playlist-Paar entfernen (Dateien auf Spotify/Tidal bleiben erhalten)
              </button>
            </div>
          </div>

          {/* Unmatched Tracks Panel */}
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-5.5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base text-white">
                Nicht gefunden ({pair.unmatchedCount || pair.unmatchedTracks?.length || 0})
              </h2>
              <span className="text-xs text-[var(--muted)]">Beim letzten Sync</span>
            </div>

            {pair.unmatchedTracks?.length ? (
              <ul className="mt-4 max-h-72 space-y-2.5 overflow-auto text-xs pr-1">
                {pair.unmatchedTracks.map((t, i) => {
                  const targetSearchUrl =
                    t.side === "spotify→tidal"
                      ? `https://listen.tidal.com/search?q=${encodeURIComponent(`${t.title} ${t.artists[0] || ""}`)}`
                      : `https://open.spotify.com/search/${encodeURIComponent(`${t.title} ${t.artists[0] || ""}`)}`;
                  const targetPlatformName = t.side === "spotify→tidal" ? "Tidal" : "Spotify";

                  return (
                    <li key={i} className="rounded-xl bg-black/30 p-2.5 border border-[var(--border)]/70">
                      <div className="font-medium text-white truncate">{t.title}</div>
                      <div className="text-[var(--muted)] mt-0.5 truncate">
                        {t.artists.join(", ")} · <span className="text-[var(--accent)]">{t.side}</span>
                      </div>
                      <div className="mt-2 pt-1.5 border-t border-white/5 flex items-center justify-end">
                        <a
                          href={targetSearchUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-[var(--spotify)] hover:underline"
                        >
                          Auf {targetPlatformName} suchen ↗
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-4 text-xs text-[var(--muted)] py-4">
                Keine nicht-zugeordneten Songs beim letzten Sync. Alle Titel wurden erfolgreich auf beiden Plattformen abgeglichen.
              </p>
            )}
          </div>
        </div>

        {/* Sync History Panel */}
        {jobs.length > 0 ? (
          <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-5.5">
            <h2 className="font-semibold text-base text-white">Letzte Sync-Läufe</h2>
            <div className="mt-3 divide-y divide-[var(--border)] text-xs">
              {jobs.slice(0, 5).map((job) => (
                <div key={job.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-medium text-white">{formatRelativeTime(job.createdAt)}</span>
                    <span className="text-[var(--muted)] ml-2">
                      {job.status === "completed"
                        ? "Abgeschlossen"
                        : job.status === "failed"
                          ? "Fehlgeschlagen"
                          : "In Arbeit"}
                    </span>
                    {job.error ? (
                      <p className="text-[var(--danger)] mt-0.5">{job.error}</p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2 text-right shrink-0">
                    {job.addedSpotify > 0 ? (
                      <span className="text-[var(--progress)]">+{job.addedSpotify} Spotify</span>
                    ) : null}
                    {job.addedTidal > 0 ? (
                      <span className="text-[var(--progress)]">+{job.addedTidal} Tidal</span>
                    ) : null}
                    {job.removedSpotify > 0 ? (
                      <span className="text-[var(--danger)]">-{job.removedSpotify} Spotify</span>
                    ) : null}
                    {job.removedTidal > 0 ? (
                      <span className="text-[var(--danger)]">-{job.removedTidal} Tidal</span>
                    ) : null}
                    {job.addedSpotify === 0 &&
                    job.addedTidal === 0 &&
                    job.removedSpotify === 0 &&
                    job.removedTidal === 0 ? (
                      <span className="text-[var(--muted)]">Keine Änderungen</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-black/30 p-3 border border-[var(--border)]/60">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div
        className="mt-1 text-xl font-semibold"
        style={{ color: danger && value > 0 ? "var(--danger)" : "var(--text)" }}
      >
        {value}
      </div>
    </div>
  );
}

export default function PairDetailPage() {
  return (
    <Suspense>
      <PairDetailInner />
    </Suspense>
  );
}
