"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ServiceBadge } from "@/components/ServiceBadge";

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
  syncMode: string;
  enabled: number;
  status: string;
  songCount: number;
  unmatchedCount: number;
  lastError: string | null;
  lastSyncedAt: string | null;
  unmatchedTracks?: Array<{ title: string; artists: string[]; side: string }> | null;
};

function PairDetailInner() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const [pair, setPair] = useState<Pair | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmMirror, setConfirmMirror] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/pairs/${id}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed");
    setPair(json.pair);
  }, [id]);

  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
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
      if (!res.ok) throw new Error(json.error || "Preview failed");
      setPlan(json.plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
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
      if (!res.ok) throw new Error(json.error || "Sync failed");
      router.replace(`/pairs/${id}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
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
    if (!confirm("Remove this playlist pair? Playlists on Spotify/Tidal stay intact.")) return;
    await fetch(`/api/pairs/${id}`, { method: "DELETE" });
    router.push("/dashboard");
  }

  if (loading) {
    return (
      <AppShell>
        <p className="p-10 text-[var(--muted)]">Loading…</p>
      </AppShell>
    );
  }

  if (!pair) {
    return (
      <AppShell>
        <p className="p-10 text-[var(--danger)]">{error || "Not found"}</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl p-6 md:p-10">
        <Link href="/dashboard" className="text-sm text-[var(--muted)] hover:text-white">
          ← Synced playlists
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1
              className="text-3xl font-semibold"
              style={{ fontFamily: "var(--font-syne), sans-serif" }}
            >
              {pair.name}
            </h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <ServiceBadge service="spotify" />
              <ServiceBadge service="tidal" />
              <span className="rounded-full bg-black/40 px-2 py-0.5 text-xs text-[var(--muted)]">
                {pair.syncMode === "mirror" ? "Mirror" : "Additive"}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={runPreview}
              disabled={previewing}
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm"
            >
              {previewing ? "Preview…" : "Dry-run"}
            </button>
            <button
              onClick={() => void startSync()}
              disabled={syncing}
              className="rounded-xl bg-[var(--spotify)] px-4 py-2 text-sm font-semibold text-black"
            >
              {syncing ? "Starting…" : "Sync now"}
            </button>
          </div>
        </div>

        {confirmMirror ? (
          <div className="mt-4 rounded-2xl border border-[var(--danger)]/50 bg-[var(--danger)]/10 p-4 text-sm">
            <p className="font-medium text-[var(--danger)]">Mirror mode will delete tracks</p>
            <p className="mt-1 text-[var(--muted)]">
              Removals on one service will be applied to the other. Continue?
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void startSync({ forceMirror: true })}
                className="rounded-xl bg-[var(--danger)] px-3 py-2 text-sm font-semibold text-white"
              >
                Yes, mirror sync
              </button>
              <button
                onClick={() => setConfirmMirror(false)}
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}

        {plan ? (
          <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-5">
            <h2 className="font-semibold">Preview ({plan.syncMode})</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="Add → Spotify" value={plan.addToSpotify} />
              <Stat label="Add → Tidal" value={plan.addToTidal} />
              <Stat label="Remove Spotify" value={plan.removeFromSpotify} danger />
              <Stat label="Remove Tidal" value={plan.removeFromTidal} danger />
            </div>
            {plan.sampleAdds.length ? (
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Sample adds</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {plan.sampleAdds.map((t, i) => (
                    <li key={i}>
                      {t.title} — {t.artists.join(", ")}{" "}
                      <span className="text-[var(--muted)]">→ {t.to}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {plan.sampleRemoves.length ? (
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wide text-[var(--danger)]">
                  Sample removals
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {plan.sampleRemoves.map((t, i) => (
                    <li key={i}>
                      {t.title} — {t.artists.join(", ")}{" "}
                      <span className="text-[var(--muted)]">from {t.from}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-5">
            <h2 className="font-semibold">Settings</h2>
            <label className="mt-4 flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={pair.enabled === 1}
                onChange={(e) => patch({ enabled: e.target.checked })}
              />
              Enabled for cron
            </label>
            <div className="mt-4">
              <p className="text-sm text-[var(--muted)]">Sync mode</p>
              <select
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                value={pair.syncMode || "additive"}
                onChange={(e) => patch({ syncMode: e.target.value })}
              >
                <option value="additive">Additive (no deletes)</option>
                <option value="mirror">Mirror (incl. deletes)</option>
              </select>
            </div>
            <p className="mt-4 text-xs text-[var(--muted)]">
              Last sync:{" "}
              {pair.lastSyncedAt ? new Date(pair.lastSyncedAt).toLocaleString() : "never"}
            </p>
            {pair.lastError ? (
              <p className="mt-2 text-sm text-[var(--danger)]">{pair.lastError}</p>
            ) : null}
            <button
              onClick={removePair}
              className="mt-6 text-sm text-[var(--danger)] hover:underline"
            >
              Remove pair
            </button>
          </div>

          <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-5">
            <h2 className="font-semibold">
              Unmatched ({pair.unmatchedCount || pair.unmatchedTracks?.length || 0})
            </h2>
            {pair.unmatchedTracks?.length ? (
              <ul className="mt-3 max-h-64 space-y-2 overflow-auto text-sm">
                {pair.unmatchedTracks.map((t, i) => (
                  <li key={i} className="rounded-xl bg-black/30 px-3 py-2">
                    <div className="font-medium">{t.title}</div>
                    <div className="text-[var(--muted)]">
                      {t.artists.join(", ")} · {t.side}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[var(--muted)]">No unmatched tracks from last sync.</p>
            )}
          </div>
        </div>
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
    <div className="rounded-2xl bg-black/30 p-3">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div
        className="mt-1 text-xl font-semibold"
        style={{ color: danger && value > 0 ? "var(--danger)" : undefined }}
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
