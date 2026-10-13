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
  const hasSpotify2 = Boolean(status?.connections.spotify_2?.connected);

  const [pairType, setPairType] = useState<"spotify_tidal" | "spotify_spotify">("spotify_tidal");
  const [source, setSource] = useState<"spotify" | "spotify_2" | "tidal">("spotify");
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [targets, setTargets] = useState<Playlist[]>([]);
  const [selected, setSelected] = useState("");
  const [targetId, setTargetId] = useState("");
  const [createTarget, setCreateTarget] = useState(true);
  const [syncMode, setSyncMode] = useState<
    "additive" | "mirror" | "one_way_a_to_b" | "one_way_b_to_a"
  >("additive");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [batching, setBatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [targetQuery, setTargetQuery] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [filterBoth, setFilterBoth] = useState(false);

  // Determine other service based on pairType and source
  const otherService: "spotify" | "spotify_2" | "tidal" = useMemo(() => {
    if (pairType === "spotify_spotify") {
      return source === "spotify" ? "spotify_2" : "spotify";
    }
    return source === "spotify" ? "tidal" : "spotify";
  }, [pairType, source]);

  // Adjust source if pairType changes
  function switchPairType(newType: "spotify_tidal" | "spotify_spotify") {
    setPairType(newType);
    setSource("spotify");
    setSelected("");
    setTargetId("");
  }

  // Map of playlists that are already part of a pair
  const pairedMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const p of status?.pairs || []) {
      if (p.spotifyPlaylistId) map.set(p.spotifyPlaylistId, { id: p.id, name: p.name });
      if (p.tidalPlaylistId) map.set(p.tidalPlaylistId, { id: p.id, name: p.name });
      if (p.spotify2PlaylistId) map.set(p.spotify2PlaylistId, { id: p.id, name: p.name });
    }
    return map;
  }, [status?.pairs]);

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
        const srcUrl =
          source === "tidal"
            ? "/api/playlists/tidal"
            : `/api/playlists/spotify?account=${source}`;
        const tgtUrl =
          otherService === "tidal"
            ? "/api/playlists/tidal"
            : `/api/playlists/spotify?account=${otherService}`;

        const [srcRes, tgtRes] = await Promise.all([fetch(srcUrl), fetch(tgtUrl)]);
        const srcJson = await srcRes.json().catch(() => ({}));
        const tgtJson = await tgtRes.json().catch(() => ({}));
        if (!srcRes.ok) {
          throw new Error(
            formatApiError(srcJson.error || `Playlists von ${sourceLabel(source)} konnten nicht geladen werden`),
          );
        }
        if (!tgtRes.ok) {
          throw new Error(
            formatApiError(tgtJson.error || `Playlists von ${sourceLabel(otherService)} konnten nicht geladen werden`),
          );
        }
        if (cancelled) return;
        setPlaylists(srcJson.playlists || []);
        setTargets(tgtJson.playlists || []);
        setSelected("");
        setTargetId("");
        setCreateTarget(true);
        setQuery("");
        setTargetQuery("");
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

  const unpairedMatches = useMemo(() => {
    return crossMatches.filter(
      (m) => !pairedMap.has(m.source.id) && !pairedMap.has(m.target.id),
    );
  }, [crossMatches, pairedMap]);

  const matchBySourceId = useMemo(() => {
    const map = new Map<string, (typeof crossMatches)[number]>();
    for (const m of crossMatches) map.set(m.source.id, m);
    return map;
  }, [crossMatches]);

  const selectedPlaylist = playlists.find((p) => p.id === selected) || null;
  const selectedTarget = targets.find((t) => t.id === targetId) || null;
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

    return [...list].sort((a, b) => {
      const aPaired = pairedMap.has(a.id) ? 1 : 0;
      const bPaired = pairedMap.has(b.id) ? 1 : 0;
      if (aPaired !== bPaired) return aPaired - bPaired; // unpaired first

      const am = matchBySourceId.has(a.id) ? 1 : 0;
      const bm = matchBySourceId.has(b.id) ? 1 : 0;
      if (am !== bm) return bm - am;

      return a.name.localeCompare(b.name);
    });
  }, [playlists, query, filterBoth, crossMatches, matchBySourceId, pairedMap]);

  const filteredTargets = useMemo(() => {
    const tq = targetQuery.trim().toLowerCase();
    let list = targets;
    if (tq) {
      list = list.filter((t) => t.name.toLowerCase().includes(tq));
    }
    return [...list].sort((a, b) => {
      const as = selectedPlaylist ? scorePlaylistNames(selectedPlaylist.name, a.name) : 0;
      const bs = selectedPlaylist ? scorePlaylistNames(selectedPlaylist.name, b.name) : 0;
      if (as !== bs) return bs - as;
      return a.name.localeCompare(b.name);
    });
  }, [targets, targetQuery, selectedPlaylist]);

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
          pairType,
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

  async function batchPairAllMatches() {
    if (!unpairedMatches.length || batching) return;
    setBatching(true);
    setError(null);
    try {
      const batchPayload = unpairedMatches.map((m) => {
        const isSp2 = pairType === "spotify_spotify";
        return {
          name: m.source.name,
          pairType,
          spotifyPlaylistId: source === "spotify" ? m.source.id : isSp2 ? m.target.id : m.target.id,
          tidalPlaylistId: isSp2 ? undefined : source === "spotify" ? m.target.id : m.source.id,
          spotify2PlaylistId: isSp2 ? (source === "spotify" ? m.target.id : m.source.id) : undefined,
          spotifyPlaylistUrl: source === "spotify" ? m.source.url : isSp2 ? m.target.url : m.target.url,
          tidalPlaylistUrl: isSp2 ? undefined : source === "spotify" ? m.target.url : m.source.url,
          spotify2PlaylistUrl: isSp2 ? (source === "spotify" ? m.target.url : m.source.url) : undefined,
          coverImage: m.source.imageUrl || m.target.imageUrl,
          syncMode,
        };
      });

      const res = await fetch("/api/pairs/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairs: batchPayload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(formatApiError(json.error || "Batch-Pairing fehlgeschlagen"));
      setSuccessNotice(`${json.createdCount} Playlists erfolgreich verknüpft!`);
      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
    } catch (e) {
      setError(formatApiError(e, "Batch-Pairing fehlgeschlagen"));
      setBatching(false);
    }
  }

  const targetLabelText = sourceLabel(otherService);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl p-6 md:p-8">
        <h1
          className="text-3xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-syne), sans-serif" }}
        >
          Playlist paaren
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Verbinde existierende Playlists beider Accounts oder erstelle automatisch das Gegenstück.
        </p>

        {status && !canPair ? (
          <div className="mt-8 rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-6">
            <p className="font-semibold text-lg">Accounts noch nicht bereit</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Speichere deine Developer-Keys und verbinde mindestens zwei Konten in den Einstellungen.
            </p>
            <Link
              href="/settings"
              className="mt-4 inline-flex rounded-2xl bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-neutral-200 transition"
            >
              Zu den Einstellungen
            </Link>
          </div>
        ) : (
          <>
            {/* Sync Type Selector (Spotify ↔ Tidal OR Spotify ↔ Spotify) */}
            <div className="mt-6 flex flex-wrap items-center gap-2.5 p-1.5 rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] max-w-xl">
              <button
                type="button"
                onClick={() => switchPairType("spotify_tidal")}
                className={`flex-1 rounded-xl py-2.5 px-4 text-xs font-semibold transition ${
                  pairType === "spotify_tidal"
                    ? "bg-black/50 text-white shadow-sm border border-[var(--border)]"
                    : "text-[var(--muted)] hover:text-white"
                }`}
              >
                Spotify ⇄ Tidal
              </button>

              <button
                type="button"
                onClick={() => {
                  if (hasSpotify2) switchPairType("spotify_spotify");
                }}
                disabled={!hasSpotify2}
                className={`flex-1 rounded-xl py-2.5 px-4 text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                  pairType === "spotify_spotify"
                    ? "bg-black/50 text-white shadow-sm border border-[var(--border)]"
                    : hasSpotify2
                      ? "text-[var(--muted)] hover:text-white"
                      : "text-[var(--muted)]/40 cursor-not-allowed"
                }`}
                title={!hasSpotify2 ? "Zweitaccount in Einstellungen verbinden" : ""}
              >
                <span>Spotify 1 ⇄ Spotify 2</span>
                {!hasSpotify2 ? (
                  <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-[var(--muted)]">
                    +Account nötig
                  </span>
                ) : null}
              </button>
            </div>

            {/* Source selector */}
            <div className="mt-5 flex flex-wrap gap-3">
              {pairType === "spotify_tidal" ? (
                <>
                  <button
                    key="spotify"
                    onClick={() => setSource("spotify")}
                    className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 transition ${
                      source === "spotify"
                        ? "border-[var(--spotify)] bg-[var(--bg-panel)] shadow-sm"
                        : "border-[var(--border)] hover:border-white/40"
                    }`}
                  >
                    <ServiceBadge service="spotify" />
                    <span className="text-sm font-medium">als Quelle</span>
                  </button>
                  <button
                    key="tidal"
                    onClick={() => setSource("tidal")}
                    className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 transition ${
                      source === "tidal"
                        ? "border-[var(--tidal)] bg-[var(--bg-panel)] shadow-sm"
                        : "border-[var(--border)] hover:border-white/40"
                    }`}
                  >
                    <ServiceBadge service="tidal" />
                    <span className="text-sm font-medium">als Quelle</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    key="spotify"
                    onClick={() => setSource("spotify")}
                    className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 transition ${
                      source === "spotify"
                        ? "border-[var(--spotify)] bg-[var(--bg-panel)] shadow-sm"
                        : "border-[var(--border)] hover:border-white/40"
                    }`}
                  >
                    <ServiceBadge service="spotify" label="Spotify (Account 1)" />
                    <span className="text-sm font-medium">als Quelle</span>
                  </button>
                  <button
                    key="spotify_2"
                    onClick={() => setSource("spotify_2")}
                    className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 transition ${
                      source === "spotify_2"
                        ? "border-[var(--spotify)] bg-[var(--bg-panel)] shadow-sm"
                        : "border-[var(--border)] hover:border-white/40"
                    }`}
                  >
                    <ServiceBadge service="spotify_2" label="Spotify (Account 2)" />
                    <span className="text-sm font-medium">als Quelle</span>
                  </button>
                </>
              )}
            </div>

            {successNotice ? (
              <div className="mt-6 rounded-2xl border border-[var(--progress)]/40 bg-[var(--progress)]/10 p-4 text-sm text-[var(--progress)] font-medium">
                {successNotice}
              </div>
            ) : null}

            {/* Already on both Section with 1-Click Batch */}
            {!loading && crossMatches.length > 0 ? (
              <section className="mt-6 rounded-3xl border border-[var(--progress)]/25 bg-[var(--bg-panel)] p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-base text-white">
                      Bereits auf beiden Accounts ({crossMatches.length})
                    </h2>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      Gefundene Namensübereinstimmungen — direkt verbinden statt Duplikate erzeugen.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {unpairedMatches.length > 0 ? (
                      <button
                        type="button"
                        onClick={batchPairAllMatches}
                        disabled={batching}
                        className="rounded-xl bg-[linear-gradient(120deg,#1ed760,#00d4ff)] px-3.5 py-1.5 text-xs font-semibold text-black hover:brightness-110 transition disabled:opacity-40"
                      >
                        {batching
                          ? "Verknüpfe…"
                          : `Alle ${unpairedMatches.length} automatisch verbinden`}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => setFilterBoth((v) => !v)}
                      className={`rounded-xl border px-3 py-1.5 text-xs transition ${
                        filterBoth
                          ? "border-[var(--progress)] text-[var(--progress)] bg-[rgba(46,229,157,0.1)]"
                          : "border-[var(--border)] text-[var(--muted)] hover:border-white/50"
                      }`}
                    >
                      {filterBoth ? "Nur Matches" : "Nur Matches filtern"}
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {crossMatches.slice(0, 6).map((m) => {
                    const alreadyPaired = pairedMap.get(m.source.id);
                    const isSelectedMatch =
                      selected === m.source.id && targetId === m.target.id && !createTarget;

                    return (
                      <div
                        key={`${m.source.id}-${m.target.id}`}
                        className={`flex items-center gap-3 rounded-2xl border p-3 transition ${
                          alreadyPaired
                            ? "border-[var(--border)] bg-black/20 opacity-70"
                            : isSelectedMatch
                              ? "border-[var(--spotify)] bg-black/30"
                              : "border-[var(--border)] hover:border-white/40"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {m.source.imageUrl ? (
                          <img
                            src={m.source.imageUrl}
                            alt=""
                            className="h-12 w-12 rounded-xl object-cover shrink-0 bg-[#222]"
                          />
                        ) : (
                          <div className="grid h-12 w-12 rounded-xl bg-black/40 place-items-center text-xs text-[var(--muted)] shrink-0">
                            ♫
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-sm text-white">{m.source.name}</p>
                          <p className="mt-0.5 text-xs text-[var(--muted)]">
                            {formatTrackCount(m.source.trackCount)} ·{" "}
                            <span className="text-[var(--progress)]">
                              {m.score >= 0.99 ? "Exakter Name" : "Ähnlicher Name"} auf {targetLabelText}
                            </span>
                            {" · "}
                            {formatTrackCount(m.target.trackCount)}
                          </p>
                        </div>

                        {alreadyPaired ? (
                          <Link
                            href={`/pairs/${alreadyPaired.id}`}
                            className="shrink-0 text-xs text-[var(--muted)] hover:text-white underline"
                          >
                            Gepaart ↗
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => linkExisting(m)}
                            className="shrink-0 rounded-lg border border-[var(--spotify)]/40 bg-[var(--spotify)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--spotify)] hover:bg-[var(--spotify)] hover:text-black transition"
                          >
                            Verbinden
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* Filter and View toggles */}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Playlists durchsuchen…"
                className="flex-1 rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] px-4 py-2.5 text-sm outline-none focus:border-[var(--spotify)] transition"
              />
              <div className="flex items-center gap-3">
                <p className="text-xs text-[var(--muted)] whitespace-nowrap">
                  {loading ? "Lade…" : `${filtered.length} von ${playlists.length}`}
                </p>
                <div className="flex rounded-xl border border-[var(--border)] p-0.5 bg-[var(--bg-panel)]">
                  <button
                    type="button"
                    onClick={() => setView("list")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      view === "list"
                        ? "bg-black/50 text-white shadow-sm"
                        : "text-[var(--muted)] hover:text-white"
                    }`}
                  >
                    Liste
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("grid")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      view === "grid"
                        ? "bg-black/50 text-white shadow-sm"
                        : "text-[var(--muted)] hover:text-white"
                    }`}
                  >
                    Kacheln
                  </button>
                </div>
              </div>
            </div>

            {/* Playlist Loader Skeletons */}
            {loading || !status ? (
              <div className="mt-4 space-y-2">
                {[1, 2, 3, 4, 5].map((idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-4 rounded-2xl border border-[var(--border)]/60 bg-[var(--bg-panel)]/40 p-3 animate-pulse"
                  >
                    <div className="h-10 w-10 rounded-xl bg-white/5 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-44 rounded bg-white/10" />
                      <div className="h-3 w-24 rounded bg-white/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className="mt-6 text-sm text-[var(--muted)] text-center py-8">
                Keine Playlists gefunden, die dem Suchfilter entsprechen.
              </p>
            ) : view === "list" ? (
              /* List View */
              <div className="mt-4 max-h-[min(65vh,640px)] space-y-1.5 overflow-auto rounded-2xl border border-[var(--border)] bg-black/20 p-2 pr-1.5">
                {filtered.map((p) => {
                  const match = matchBySourceId.get(p.id);
                  const alreadyPaired = pairedMap.get(p.id);

                  return (
                    <label
                      key={p.id}
                      className={`flex cursor-pointer items-center gap-3.5 rounded-xl border px-3 py-2.5 transition ${
                        selected === p.id
                          ? "border-[var(--spotify)] bg-[var(--bg-panel)] shadow-sm"
                          : alreadyPaired
                            ? "border-transparent opacity-60 hover:opacity-100"
                            : "border-transparent hover:bg-white/5"
                      }`}
                    >
                      <input
                        type="radio"
                        name="playlist"
                        checked={selected === p.id}
                        onChange={() => selectSource(p.id)}
                        className="shrink-0 accent-[var(--spotify)]"
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt=""
                          className="h-10 w-10 rounded-lg object-cover shrink-0 bg-[#222]"
                        />
                      ) : (
                        <div className="grid h-10 w-10 rounded-lg bg-black/40 place-items-center text-xs text-[var(--muted)] shrink-0">
                          ♫
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium text-sm text-white">{p.name}</span>
                          {alreadyPaired ? (
                            <span className="rounded-full bg-white/10 border border-white/10 px-2 py-0.5 text-[10px] text-[var(--muted)]">
                              Bereits synchronisiert
                            </span>
                          ) : match ? (
                            <span className="rounded-full bg-[rgba(46,229,157,0.12)] border border-[rgba(46,229,157,0.25)] px-2 py-0.5 text-[10px] text-[var(--progress)]">
                              Auch auf {targetLabelText}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-[var(--muted)] mt-0.5">
                          {formatTrackCount(p.trackCount)}
                          {match && !alreadyPaired
                            ? ` · ↔ ${match.target.name} (${formatTrackCount(match.target.trackCount)})`
                            : ""}
                        </div>
                      </div>

                      {alreadyPaired ? (
                        <Link
                          href={`/pairs/${alreadyPaired.id}`}
                          className="shrink-0 text-xs text-[var(--muted)] hover:text-white underline pr-2"
                        >
                          Zum Paar →
                        </Link>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            ) : (
              /* Tile / Grid View */
              <div className="mt-4 max-h-[min(65vh,640px)] overflow-auto rounded-2xl border border-[var(--border)] bg-black/20 p-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {filtered.map((p) => {
                    const active = selected === p.id;
                    const match = matchBySourceId.get(p.id);
                    const alreadyPaired = pairedMap.get(p.id);

                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectSource(p.id)}
                        className={`rounded-2xl border p-2.5 text-left transition relative ${
                          active
                            ? "border-[var(--spotify)] bg-[var(--bg-panel)] shadow-sm"
                            : alreadyPaired
                              ? "border-[var(--border)] opacity-60 hover:opacity-100"
                              : "border-[var(--border)] hover:border-white/40"
                        }`}
                      >
                        <div className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt=""
                              className="aspect-square w-full rounded-xl object-cover bg-[#222]"
                            />
                          ) : (
                            <div className="aspect-square w-full rounded-xl bg-black/40 grid place-items-center text-xl text-[var(--muted)]">
                              ♫
                            </div>
                          )}
                          {alreadyPaired ? (
                            <span className="absolute left-1.5 top-1.5 rounded-full bg-black/85 px-1.5 py-0.5 text-[9px] text-[var(--muted)] border border-white/10">
                              Gepaart
                            </span>
                          ) : match ? (
                            <span className="absolute left-1.5 top-1.5 rounded-full bg-black/85 px-1.5 py-0.5 text-[9px] text-[var(--progress)] border border-[rgba(46,229,157,0.3)]">
                              Beide
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 truncate text-sm font-medium text-white">{p.name}</p>
                        <p className="text-xs text-[var(--muted)]">
                          {formatTrackCount(p.trackCount)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Side-by-Side Comparison Card when Source is chosen */}
            {selectedPlaylist ? (
              <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-5 shadow-sm">
                <p className="text-xs uppercase tracking-wider text-[var(--muted)] font-semibold">
                  Gewähltes Paar im Vergleich
                </p>

                <div className="mt-3 flex flex-col md:flex-row items-center justify-between gap-4 bg-black/30 rounded-2xl p-4 border border-[var(--border)]">
                  {/* Source Side */}
                  <div className="flex items-center gap-3 min-w-0 w-full md:w-auto">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {selectedPlaylist.imageUrl ? (
                      <img
                        src={selectedPlaylist.imageUrl}
                        alt=""
                        className="h-12 w-12 rounded-xl object-cover bg-[#222] shrink-0"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-xl bg-black/40 grid place-items-center text-sm text-[var(--muted)] shrink-0">
                        ♫
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <ServiceBadge service={source} label={sourceLabel(source)} />
                        <span className="text-xs text-[var(--muted)]">Quelle</span>
                      </div>
                      <p className="font-semibold text-sm truncate text-white mt-0.5">
                        {selectedPlaylist.name}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {formatTrackCount(selectedPlaylist.trackCount)}
                      </p>
                    </div>
                  </div>

                  {/* Sync Arrow Indicator */}
                  <div className="flex flex-col items-center justify-center shrink-0 text-center">
                    <span className="text-xl font-bold text-[var(--spotify)]">⇄</span>
                    <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">
                      {syncModeLabel(syncMode)}
                    </span>
                  </div>

                  {/* Target Side */}
                  <div className="flex items-center gap-3 min-w-0 w-full md:w-auto">
                    {selectedTarget?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selectedTarget.imageUrl}
                        alt=""
                        className="h-12 w-12 rounded-xl object-cover bg-[#222] shrink-0"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-xl bg-black/40 grid place-items-center text-sm text-[var(--muted)] shrink-0">
                        ♫
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <ServiceBadge service={otherService} label={sourceLabel(otherService)} />
                        <span className="text-xs text-[var(--muted)]">Ziel</span>
                      </div>
                      <p className="font-semibold text-sm truncate text-white mt-0.5">
                        {createTarget ? `Neu: „${selectedPlaylist.name}“` : selectedTarget?.name || "Nicht gewählt"}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {createTarget
                          ? "Wird neu angelegt"
                          : formatTrackCount(selectedTarget?.trackCount || 0)}
                      </p>
                    </div>
                  </div>
                </div>

                {!createTarget && selectedTarget ? (
                  <p className="mt-3 text-xs text-[var(--muted)]">
                    Unterschied: ~
                    {Math.abs(selectedPlaylist.trackCount - selectedTarget.trackCount)} Songs Differenz.
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Target Options & Sync Mode */}
            <div className="mt-6 space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-5">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreateTarget(false);
                    if (liveTargetHint) setTargetId(liveTargetHint.target.id);
                  }}
                  className={`rounded-2xl border p-3.5 text-left text-sm transition ${
                    !createTarget
                      ? "border-[var(--spotify)] bg-black/30"
                      : "border-[var(--border)] hover:border-white/30"
                  }`}
                >
                  <strong className="text-white">Bestehende Playlist auf {targetLabelText} verknüpfen</strong>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Nutzt ein bereits vorhandenes Gegenstück — verhindert doppelte Playlists.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreateTarget(true);
                    setTargetId("");
                  }}
                  className={`rounded-2xl border p-3.5 text-left text-sm transition ${
                    createTarget
                      ? "border-[var(--spotify)] bg-black/30"
                      : "border-[var(--border)] hover:border-white/30"
                  }`}
                >
                  <strong className="text-white">Neue Playlist auf {targetLabelText} anlegen</strong>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Erstellt eine frische Ziel-Playlist mit demselben Namen.
                  </p>
                </button>
              </div>

              {!createTarget ? (
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase tracking-wider text-[var(--muted)] font-medium">
                      Ziel-Playlist auf {targetLabelText} auswählen
                    </span>
                    {liveTargetHint ? (
                      <span className="text-xs text-[var(--progress)]">
                        Empfohlen: {liveTargetHint.target.name}
                      </span>
                    ) : null}
                  </div>

                  <input
                    value={targetQuery}
                    onChange={(e) => setTargetQuery(e.target.value)}
                    placeholder={`Ziel-Playlists auf ${targetLabelText} filtern…`}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[var(--spotify)] mb-2"
                  />

                  <div className="max-h-48 overflow-auto rounded-xl border border-[var(--border)] bg-black/20 p-1.5 space-y-1">
                    {filteredTargets.map((t) => {
                      const isMatch = liveTargetHint?.target.id === t.id;
                      const isChosen = targetId === t.id;

                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTargetId(t.id)}
                          className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left text-sm transition ${
                            isChosen
                              ? "bg-[var(--spotify)] text-black font-medium"
                              : "text-white hover:bg-white/5"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {t.imageUrl ? (
                              <img src={t.imageUrl} alt="" className="h-7 w-7 rounded object-cover shrink-0" />
                            ) : (
                              <div className="h-7 w-7 rounded bg-black/40 grid place-items-center text-[10px] text-[var(--muted)] shrink-0">
                                ♫
                              </div>
                            )}
                            <span className="truncate">{t.name}</span>
                            {isMatch && !isChosen ? (
                              <span className="rounded bg-[var(--progress)]/20 px-1.5 py-0.2 text-[10px] text-[var(--progress)]">
                                Match
                              </span>
                            ) : null}
                          </div>
                          <span className={`text-xs shrink-0 ${isChosen ? "text-black/80" : "text-[var(--muted)]"}`}>
                            {formatTrackCount(t.trackCount)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Sync mode cards */}
              <div>
                <p className="text-sm font-medium text-white">Sync-Einstellungen</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Gilt für dieses Paar. Später auf der Detailseite änderbar.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => setSyncMode("additive")}
                    className={`rounded-2xl border p-3.5 text-left text-sm transition ${
                      syncMode === "additive"
                        ? "border-[var(--spotify)] bg-black/30 shadow-sm"
                        : "border-[var(--border)] hover:border-white/30"
                    }`}
                  >
                    <strong className="text-white block">Additive Sync</strong>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Nur hinzufügen, nie löschen. Der sicherste Standard für beide Seiten.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSyncMode("mirror")}
                    className={`rounded-2xl border p-3.5 text-left text-sm transition ${
                      syncMode === "mirror"
                        ? "border-[var(--danger)] bg-black/30 shadow-sm"
                        : "border-[var(--border)] hover:border-white/30"
                    }`}
                  >
                    <strong className="text-white block">Zwei-Wege Mirror</strong>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Spiegelt Hinzufügungen & Löschungen in beide Richtungen (mit Notbremse).
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSyncMode("one_way_a_to_b")}
                    className={`rounded-2xl border p-3.5 text-left text-sm transition ${
                      syncMode === "one_way_a_to_b"
                        ? "border-[var(--accent)] bg-black/30 shadow-sm"
                        : "border-[var(--border)] hover:border-white/30"
                    }`}
                  >
                    <strong className="text-white block">Einweg (Master → Replica)</strong>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Quelle bestimmt den Inhalt exakt 1:1. Quelle bleibt unberührt.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSyncMode("one_way_b_to_a")}
                    className={`rounded-2xl border p-3.5 text-left text-sm transition ${
                      syncMode === "one_way_b_to_a"
                        ? "border-[var(--accent)] bg-black/30 shadow-sm"
                        : "border-[var(--border)] hover:border-white/30"
                    }`}
                  >
                    <strong className="text-white block">Einweg (Ziel → Quelle)</strong>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Das Ziel schreibt zurück. Die Zielseite bleibt unberührt.
                    </p>
                  </button>
                </div>
              </div>
            </div>

            {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}

            {/* Submit button */}
            <button
              disabled={!selected || submitting || (!createTarget && !targetId)}
              onClick={submit}
              className="mt-6 rounded-2xl bg-[linear-gradient(120deg,#1ed760,#e8ff6b)] px-6 py-3 font-semibold text-black disabled:opacity-40 hover:brightness-110 transition shadow-[0_10px_30px_rgba(30,215,96,0.2)]"
            >
              {submitting
                ? "Erstelle Paar…"
                : createTarget
                  ? "Weiter zur Vorschau"
                  : "Verknüpfen & Vorschau ansehen"}
            </button>
          </>
        )}
      </div>
    </AppShell>
  );
}

function formatTrackCount(n: number) {
  return `${n} ${n === 1 ? "Track" : "Tracks"}`;
}

function sourceLabel(s: "spotify" | "spotify_2" | "tidal"): string {
  if (s === "spotify") return "Spotify (Account 1)";
  if (s === "spotify_2") return "Spotify (Account 2)";
  return "Tidal";
}

function syncModeLabel(m: string): string {
  if (m === "mirror") return "Mirror Sync";
  if (m === "one_way_a_to_b" || m === "one_way_b_to_a") return "Einweg Sync";
  return "Additive Sync";
}
