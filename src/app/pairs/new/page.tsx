"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ServiceBadge } from "@/components/ServiceBadge";
import { useStatus } from "@/hooks/useStatus";
import {
  findBestTargetMatch,
  matchPlaylistsAcrossServices,
  scorePlaylistNames,
  type NamedPlaylist,
} from "@/lib/matching/playlists";
import { formatApiError } from "@/lib/format-error";

type Playlist = NamedPlaylist;

export default function NewPairPage() {
  const router = useRouter();
  const { data: status } = useStatus(10_000);
  const canPair = Boolean(status?.setup?.ready);
  const [source, setSource] = useState<"spotify" | "tidal">("spotify");
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [targets, setTargets] = useState<Playlist[]>([]);
  const [selected, setSelected] = useState("");
  const [targetId, setTargetId] = useState("");
  const [createTarget, setCreateTarget] = useState(true);
  const [syncMode, setSyncMode] = useState<"additive" | "mirror">("additive");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [filterBoth, setFilterBoth] = useState(false);

  const otherService = source === "spotify" ? "tidal" : "spotify";

  useEffect(() => {
    if (status && !status.setup?.ready) {
      setLoading(false);
      return;
    }
    if (!status?.setup?.ready) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [srcRes, tgtRes] = await Promise.all([
          fetch(`/api/playlists/${source}`),
          fetch(`/api/playlists/${otherService}`),
        ]);
        const srcJson = await srcRes.json().catch(() => ({}));
        const tgtJson = await tgtRes.json().catch(() => ({}));
        if (!srcRes.ok) {
          throw new Error(
            formatApiError(srcJson.error || `Playlists von ${source} konnten nicht geladen werden`),
          );
        }
        if (!tgtRes.ok) {
          throw new Error(
            formatApiError(
              tgtJson.error || `Playlists von ${otherService} konnten nicht geladen werden`,
            ),
          );
        }
        if (cancelled) return;
        setPlaylists(srcJson.playlists || []);
        setTargets(tgtJson.playlists || []);
        setSelected("");
        setTargetId("");
        setCreateTarget(true);
        setQuery("");
      } catch (e) {
        if (!cancelled) setError(formatApiError(e, "Playlists konnten nicht geladen werden"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [source, otherService, status?.setup?.ready]);

  const crossMatches = useMemo(
    () => matchPlaylistsAcrossServices(playlists, targets),
    [playlists, targets],
  );

  const matchBySourceId = useMemo(() => {
    const map = new Map<string, (typeof crossMatches)[number]>();
    for (const m of crossMatches) map.set(m.source.id, m);
    return map;
  }, [crossMatches]);

  const selectedPlaylist = playlists.find((p) => p.id === selected) || null;
  const selectedMatch = selected ? matchBySourceId.get(selected) : undefined;
  const liveTargetHint = useMemo(() => {
    if (!selectedPlaylist) return null;
    return findBestTargetMatch(selectedPlaylist, targets);
  }, [selectedPlaylist, targets]);

  function selectSource(id: string) {
    setSelected(id);
    const playlist = playlists.find((p) => p.id === id);
    const hit =
      matchBySourceId.get(id) ||
      (playlist ? findBestTargetMatch(playlist, targets) : null);
    if (hit) {
      setCreateTarget(false);
      setTargetId(hit.target.id);
    } else {
      setCreateTarget(true);
      setTargetId("");
    }
  }

  function linkExisting(match: { source: Playlist; target: Playlist }) {
    setSelected(match.source.id);
    setCreateTarget(false);
    setTargetId(match.target.id);
    setFilterBoth(false);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = playlists;
    if (filterBoth) {
      const ids = new Set(crossMatches.map((m) => m.source.id));
      list = list.filter((p) => ids.has(p.id));
    }
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    // Matched playlists first
    return [...list].sort((a, b) => {
      const am = matchBySourceId.has(a.id) ? 1 : 0;
      const bm = matchBySourceId.has(b.id) ? 1 : 0;
      if (am !== bm) return bm - am;
      return a.name.localeCompare(b.name);
    });
  }, [playlists, query, filterBoth, crossMatches, matchBySourceId]);

  async function submit() {
    const playlist = playlists.find((p) => p.id === selected);
    if (!playlist) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/pairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          sourcePlaylistId: playlist.id,
          sourcePlaylistName: playlist.name,
          sourcePlaylistUrl: playlist.url,
          coverImage: playlist.imageUrl,
          createTarget,
          targetPlaylistId: createTarget ? undefined : targetId || undefined,
          syncMode,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(formatApiError(json.error || "Paar konnte nicht erstellt werden"));
      router.push(`/pairs/${json.pair.id}?preview=1`);
    } catch (e) {
      setError(formatApiError(e, "Paar konnte nicht erstellt werden"));
      setSubmitting(false);
    }
  }

  const targetLabel = otherService === "spotify" ? "Spotify" : "Tidal";

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-6 md:p-8">
        <h1
          className="text-3xl font-semibold"
          style={{ fontFamily: "var(--font-syne), sans-serif" }}
        >
          Pair playlist
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Link playlists that already exist on both services, or create the missing side.
        </p>

        {status && !canPair ? (
          <div className="mt-8 rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-6">
            <p className="font-semibold">Accounts not ready</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Save developer keys and connect Spotify + Tidal before pairing a playlist.
            </p>
            <Link
              href="/settings"
              className="mt-4 inline-flex rounded-2xl bg-white px-5 py-2.5 text-sm font-semibold text-black"
            >
              Go to Settings
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap gap-3">
              {(["spotify", "tidal"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSource(s)}
                  className={`rounded-2xl border px-4 py-3 ${
                    source === s
                      ? "border-[var(--spotify)] bg-[var(--bg-panel)]"
                      : "border-[var(--border)]"
                  }`}
                >
                  <ServiceBadge service={s} /> <span className="ml-2 text-sm">as source</span>
                </button>
              ))}
            </div>

            {!loading && crossMatches.length > 0 ? (
              <section className="mt-6 rounded-3xl border border-[var(--progress)]/25 bg-[var(--bg-panel)] p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">Already on both</h2>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {crossMatches.length} name match
                      {crossMatches.length === 1 ? "" : "es"} — link instead of creating a duplicate.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFilterBoth((v) => !v)}
                    className={`rounded-xl border px-3 py-1.5 text-xs ${
                      filterBoth
                        ? "border-[var(--progress)] text-[var(--progress)]"
                        : "border-[var(--border)] text-[var(--muted)]"
                    }`}
                  >
                    {filterBoth ? "Showing matches only" : "Filter list to matches"}
                  </button>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {crossMatches.slice(0, 8).map((m) => (
                    <button
                      key={`${m.source.id}-${m.target.id}`}
                      type="button"
                      onClick={() => linkExisting(m)}
                      className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition hover:border-white/50 ${
                        selected === m.source.id && targetId === m.target.id && !createTarget
                          ? "border-[var(--spotify)] bg-black/30"
                          : "border-[var(--border)]"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {m.source.imageUrl ? (
                        <img
                          src={m.source.imageUrl}
                          alt=""
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-[#222]" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{m.source.name}</p>
                        <p className="mt-0.5 text-xs text-[var(--muted)]">
                          {formatTrackCount(m.source.trackCount)} ·{" "}
                          <span className="text-[var(--progress)]">
                            {m.score >= 0.99 ? "exact name" : "similar name"} on {targetLabel}
                          </span>
                          {" · "}
                          {formatTrackCount(m.target.trackCount)} there
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-medium text-[var(--spotify)]">
                        Link
                      </span>
                    </button>
                  ))}
                </div>
                {crossMatches.length > 8 ? (
                  <p className="mt-3 text-xs text-[var(--muted)]">
                    +{crossMatches.length - 8} more — use filter or search below.
                  </p>
                ) : null}
              </section>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search playlists…"
                className="flex-1 rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] px-4 py-2.5 text-sm outline-none focus:border-[var(--spotify)]"
              />
              <div className="flex items-center gap-2">
                <p className="text-xs text-[var(--muted)] whitespace-nowrap">
                  {loading ? "…" : `${filtered.length} / ${playlists.length}`}
                </p>
                <div className="flex rounded-xl border border-[var(--border)] p-0.5">
                  <button
                    type="button"
                    onClick={() => setView("list")}
                    className={`rounded-lg px-3 py-1.5 text-xs ${
                      view === "list" ? "bg-[var(--bg-panel)] text-white" : "text-[var(--muted)]"
                    }`}
                  >
                    List
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("grid")}
                    className={`rounded-lg px-3 py-1.5 text-xs ${
                      view === "grid" ? "bg-[var(--bg-panel)] text-white" : "text-[var(--muted)]"
                    }`}
                  >
                    Tiles
                  </button>
                </div>
              </div>
            </div>

            {loading || !status ? (
              <p className="mt-6 text-[var(--muted)]">Loading playlists…</p>
            ) : filtered.length === 0 ? (
              <p className="mt-6 text-sm text-[var(--muted)]">No playlists match.</p>
            ) : view === "list" ? (
              <div className="mt-4 max-h-[min(70vh,720px)] space-y-1.5 overflow-auto rounded-2xl border border-[var(--border)] bg-black/20 p-2 pr-1">
                {filtered.map((p) => {
                  const match = matchBySourceId.get(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${
                        selected === p.id
                          ? "border-[var(--spotify)] bg-[var(--bg-panel)]"
                          : "border-transparent hover:bg-white/5"
                      }`}
                    >
                      <input
                        type="radio"
                        name="playlist"
                        checked={selected === p.id}
                        onChange={() => selectSource(p.id)}
                        className="shrink-0"
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt="" className="h-10 w-10 rounded-md object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-md bg-[#222]" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium">{p.name}</span>
                          {match ? (
                            <span className="rounded-full bg-[rgba(46,229,157,0.12)] px-2 py-0.5 text-[10px] text-[var(--progress)]">
                              Also on {targetLabel}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-[var(--muted)]">
                          {formatTrackCount(p.trackCount)}
                          {match
                            ? ` · ↔ ${match.target.name} (${formatTrackCount(match.target.trackCount)})`
                            : ""}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 max-h-[min(70vh,720px)] overflow-auto rounded-2xl border border-[var(--border)] bg-black/20 p-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {filtered.map((p) => {
                    const active = selected === p.id;
                    const match = matchBySourceId.get(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectSource(p.id)}
                        className={`rounded-2xl border p-2 text-left transition ${
                          active
                            ? "border-[var(--spotify)] bg-[var(--bg-panel)]"
                            : "border-[var(--border)] hover:border-white/40"
                        }`}
                      >
                        <div className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt=""
                              className="aspect-square w-full rounded-xl object-cover"
                            />
                          ) : (
                            <div className="aspect-square w-full rounded-xl bg-[#222]" />
                          )}
                          {match ? (
                            <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] text-[var(--progress)]">
                              Both
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 truncate text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-[var(--muted)]">
                          {formatTrackCount(p.trackCount)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-6 space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-5">
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreateTarget(false);
                    if (liveTargetHint) setTargetId(liveTargetHint.target.id);
                  }}
                  className={`rounded-2xl border p-3 text-left text-sm ${
                    !createTarget
                      ? "border-[var(--spotify)] bg-black/30"
                      : "border-[var(--border)]"
                  }`}
                >
                  <strong>Link existing on {targetLabel}</strong>
                  <p className="mt-1 text-[var(--muted)]">
                    Use a playlist that already exists — no duplicate.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreateTarget(true);
                    setTargetId("");
                  }}
                  className={`rounded-2xl border p-3 text-left text-sm ${
                    createTarget
                      ? "border-[var(--spotify)] bg-black/30"
                      : "border-[var(--border)]"
                  }`}
                >
                  <strong>Create new on {targetLabel}</strong>
                  <p className="mt-1 text-[var(--muted)]">
                    Only if it doesn’t exist there yet.
                  </p>
                </button>
              </div>

              {!createTarget ? (
                <div>
                  {liveTargetHint || selectedMatch ? (
                    <p className="mb-2 text-xs text-[var(--progress)]">
                      Suggested:{" "}
                      {(liveTargetHint || selectedMatch)!.target.name}
                      {" · "}
                      {formatTrackCount((liveTargetHint || selectedMatch)!.target.trackCount)}
                    </p>
                  ) : selected ? (
                    <p className="mb-2 text-xs text-[var(--muted)]">
                      No strong name match — pick manually below.
                    </p>
                  ) : null}
                  <select
                    className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                  >
                    <option value="">Select existing playlist…</option>
                    {[...targets]
                      .sort((a, b) => {
                        const as = selectedPlaylist
                          ? scorePlaylistNames(selectedPlaylist.name, a.name)
                          : 0;
                        const bs = selectedPlaylist
                          ? scorePlaylistNames(selectedPlaylist.name, b.name)
                          : 0;
                        if (as !== bs) return bs - as;
                        return a.name.localeCompare(b.name);
                      })
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({formatTrackCount(t.trackCount)})
                        </option>
                      ))}
                  </select>
                </div>
              ) : null}

              <div>
                <p className="text-sm font-medium">Sync mode</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setSyncMode("additive")}
                    className={`rounded-2xl border p-3 text-left text-sm ${
                      syncMode === "additive"
                        ? "border-[var(--spotify)] bg-black/30"
                        : "border-[var(--border)]"
                    }`}
                  >
                    <strong>Additive</strong>
                    <p className="mt-1 text-[var(--muted)]">
                      Only add missing tracks. Safer default.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSyncMode("mirror")}
                    className={`rounded-2xl border p-3 text-left text-sm ${
                      syncMode === "mirror"
                        ? "border-[var(--danger)] bg-black/30"
                        : "border-[var(--border)]"
                    }`}
                  >
                    <strong>Mirror</strong>
                    <p className="mt-1 text-[var(--muted)]">
                      Also propagate deletions both ways.
                    </p>
                  </button>
                </div>
              </div>
            </div>

            {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}

            <button
              disabled={!selected || submitting || (!createTarget && !targetId)}
              onClick={submit}
              className="mt-6 rounded-2xl bg-[linear-gradient(120deg,#1ed760,#e8ff6b)] px-5 py-3 font-semibold text-black disabled:opacity-40"
            >
              {submitting
                ? "Creating…"
                : createTarget
                  ? "Continue to preview"
                  : "Link & preview"}
            </button>
          </>
        )}
      </div>
    </AppShell>
  );
}

function formatTrackCount(n: number) {
  return `${n} track${n === 1 ? "" : "s"}`;
}
