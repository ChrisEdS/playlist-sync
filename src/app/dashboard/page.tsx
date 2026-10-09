"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProgressBar } from "@/components/ProgressBar";
import { ServiceBadge } from "@/components/ServiceBadge";
import { useStatus } from "@/hooks/useStatus";

export default function DashboardPage() {
  const { data, error, refresh } = useStatus();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");

  const pairs = useMemo(() => {
    let list = data?.pairs || [];
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (sort === "name") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "progress") {
      list = [...list].sort((a, b) => b.progressPercent - a.progressPercent);
    }
    return list;
  }, [data?.pairs, query, sort]);

  const matchingMessage =
    data?.activeJob?.message ||
    (data?.activeJob?.currentTrack
      ? `MATCHING: ${data.activeJob.currentTrack}`
      : null);

  async function syncPair(id: string) {
    await fetch(`/api/pairs/${id}/sync`, { method: "POST" });
    refresh();
  }

  return (
    <AppShell>
      <div className="grid min-h-screen grid-cols-1 xl:grid-cols-[320px_1fr]">
        <section className="border-r border-[var(--border)] bg-black/20 p-5 space-y-5">
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-5 rise">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
              Currently Being Processed
            </p>
            {data?.activePair || data?.activeJob ? (
              <>
                <h2
                  className="mt-3 text-xl font-semibold"
                  style={{ fontFamily: "var(--font-syne), sans-serif" }}
                >
                  {data.activePair?.name || "Sync job"}
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ServiceBadge service="spotify" />
                  <ServiceBadge service="tidal" />
                </div>
                <div className="mt-4">
                  <ProgressBar
                    value={
                      data.activeJob && data.activeJob.total > 0
                        ? Math.round(
                            (data.activeJob.processed / data.activeJob.total) * 100,
                          )
                        : data.activePair?.progressPercent || 0
                    }
                  />
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    {data.activeJob
                      ? `${data.activeJob.processed}/${data.activeJob.total || "…"} · ${data.activeJob.status}`
                      : `${data.activePair?.songCount || 0} songs`}
                  </p>
                </div>
              </>
            ) : (
              <p className="mt-4 text-sm text-[var(--muted)]">No active sync right now.</p>
            )}
          </div>

          <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-5 rise">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Summary</p>
            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--muted)]">Total Playlists</span>
                <strong>{data?.summary.totalPlaylists ?? "—"}</strong>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--muted)]">Total Songs</span>
                <strong>{data?.summary.totalSongs ?? "—"}</strong>
              </div>
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-[var(--muted)]">Overall Progress</span>
                  <strong>{data?.summary.overallProgress ?? 0}%</strong>
                </div>
                <ProgressBar value={data?.summary.overallProgress ?? 0} />
              </div>
            </div>
          </div>
        </section>

        <section className="relative p-6 md:p-8">
          {matchingMessage ? (
            <div className="matching-pill pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-[var(--border)] bg-black/70 px-4 py-2 text-xs uppercase tracking-wide text-[var(--accent)] backdrop-blur">
              {matchingMessage}
            </div>
          ) : null}

          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1
                className="text-3xl font-semibold tracking-tight"
                style={{ fontFamily: "var(--font-syne), sans-serif" }}
              >
                Your Transfers ({data?.summary.totalPlaylists ?? 0})
              </h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Bidirectional Voll-Sync between Spotify and Tidal
              </p>
            </div>
            <Link
              href="/transfers/new"
              className="inline-flex items-center justify-center rounded-2xl bg-[linear-gradient(120deg,#b8ff57,#1ed760_45%,#ffe56b)] px-5 py-3 font-semibold text-black shadow-[0_10px_40px_rgba(30,215,96,0.25)]"
            >
              + New transfer
            </Link>
          </div>

          <div className="mt-6 flex flex-col gap-3 md:flex-row">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search playlists…"
              className="flex-1 rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] px-4 py-3 outline-none focus:border-[var(--spotify)]"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] px-4 py-3"
            >
              <option value="newest">Newest First</option>
              <option value="name">Name</option>
              <option value="progress">Progress</option>
            </select>
          </div>

          {error ? (
            <p className="mt-6 rounded-2xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 p-4 text-sm">
              {error.includes("DATABASE_URL")
                ? "Database not configured. Set DATABASE_URL (Neon) and run npm run db:push."
                : error}
            </p>
          ) : null}

          <div className="mt-6 space-y-3">
            {pairs.map((pair, i) => (
              <article
                key={pair.id}
                className="rise flex flex-col gap-4 rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)]/90 p-4 md:flex-row md:items-center md:justify-between"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="truncate text-lg font-semibold">{pair.name}</h3>
                    <span className="text-sm text-[var(--muted)]">{pair.songCount} songs</span>
                    <span className="text-sm text-[var(--progress)]">
                      {pair.progressPercent || 0}%
                    </span>
                    {pair.status === "syncing" || pair.status === "matching" ? (
                      <span className="inline-flex items-center gap-2 text-sm text-[var(--spotify)]">
                        <span className="h-2 w-2 rounded-full bg-[var(--spotify)]" />
                        Syncing now
                      </span>
                    ) : pair.status === "error" ? (
                      <span className="text-sm text-[var(--danger)]">Error</span>
                    ) : (
                      <span className="text-sm text-[var(--muted)]">In sync</span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ServiceBadge service="spotify" />
                    <ServiceBadge service="tidal" />
                  </div>
                  {pair.lastError ? (
                    <p className="mt-2 text-xs text-[var(--danger)]">{pair.lastError}</p>
                  ) : null}
                  {pair.unmatchedCount > 0 ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {pair.unmatchedCount} unmatched tracks
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <div className="grid grid-cols-2 gap-1">
                    {(pair.coverImages || []).slice(0, 4).map((src, idx) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={idx}
                        src={src}
                        alt=""
                        className="h-10 w-10 rounded-md object-cover bg-[#222]"
                      />
                    ))}
                    {!pair.coverImages?.length ? (
                      <>
                        <div className="h-10 w-10 rounded-md bg-[#222]" />
                        <div className="h-10 w-10 rounded-md bg-[#222]" />
                        <div className="h-10 w-10 rounded-md bg-[#222]" />
                        <div className="h-10 w-10 rounded-md bg-[#222]" />
                      </>
                    ) : null}
                  </div>
                  <button
                    onClick={() => syncPair(pair.id)}
                    className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--spotify)]"
                  >
                    Sync now
                  </button>
                </div>
              </article>
            ))}
            {!pairs.length && !error ? (
              <div className="rounded-3xl border border-dashed border-[var(--border)] p-10 text-center text-[var(--muted)]">
                No playlist pairs yet.{" "}
                <Link href="/transfers/new" className="text-[var(--spotify)]">
                  Create your first transfer
                </Link>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
