import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { canonicalKey } from "../matching";
import type { NormalizedTrack } from "../providers/types";
import {
  addTracksToSpotifyPlaylist,
  getSpotifyPlaylistTracks,
  removeTracksFromSpotifyPlaylist,
  searchSpotifyTrack,
} from "../providers/spotify";
import {
  addTracksToTidalPlaylist,
  getTidalPlaylistTracks,
  removeTracksFromTidalPlaylist,
  searchTidalTrack,
} from "../providers/tidal";

export type SyncProgress = {
  currentTrack?: string;
  message?: string;
  total: number;
  processed: number;
  matched: number;
  unmatched: number;
  addedSpotify: number;
  addedTidal: number;
  removedSpotify: number;
  removedTidal: number;
  unmatchedTracks: Array<{ title: string; artists: string[]; side: string }>;
  heldRemovals?: Array<{ title: string; artists: string[]; from: string }>;
};

export type SyncPlan = {
  syncMode: string;
  addToSpotify: number;
  addToTidal: number;
  removeFromSpotify: number;
  removeFromTidal: number;
  sampleAdds: Array<{ title: string; artists: string[]; to: string }>;
  sampleRemoves: Array<{ title: string; artists: string[]; from: string }>;
  heldRemovals?: Array<{ title: string; artists: string[]; from: string }>;
  sideAName: string;
  sideBName: string;
};

type SideMap = Map<string, NormalizedTrack>;

async function upsertMatch(
  key: string,
  track: NormalizedTrack,
  side: "spotify" | "spotify_2" | "tidal",
) {
  const db = await getDb();
  const existing = await db
    .select()
    .from(schema.trackMatches)
    .where(eq(schema.trackMatches.canonicalKey, key))
    .limit(1);
  const row = existing[0];
  const isSpotify = side === "spotify" || side === "spotify_2";
  const base = {
    canonicalKey: key,
    isrc: track.isrc || row?.isrc || null,
    title: track.title,
    artists: track.artists,
    durationMs: track.durationMs,
    spotifyTrackId: isSpotify ? track.id : row?.spotifyTrackId || null,
    tidalTrackId: side === "tidal" ? track.id : row?.tidalTrackId || null,
    updatedAt: new Date(),
  };
  if (row) {
    await db
      .update(schema.trackMatches)
      .set({
        ...base,
        spotifyTrackId: isSpotify ? track.id : row.spotifyTrackId,
        tidalTrackId: side === "tidal" ? track.id : row.tidalTrackId,
      })
      .where(eq(schema.trackMatches.id, row.id));
  } else {
    await db.insert(schema.trackMatches).values(base);
  }
}

async function resolveIdForSide(
  key: string,
  source: NormalizedTrack,
  side: "spotify" | "spotify_2" | "tidal",
  onProgress?: (p: Partial<SyncProgress>) => Promise<void>,
): Promise<string | null> {
  const db = await getDb();
  const cached = await db
    .select()
    .from(schema.trackMatches)
    .where(eq(schema.trackMatches.canonicalKey, key))
    .limit(1);
  const hit = cached[0];

  const isSpotify = side === "spotify" || side === "spotify_2";

  // Between two Spotify accounts, if the track already has a Spotify track ID, it's directly valid!
  if (isSpotify && hit?.spotifyTrackId) return hit.spotifyTrackId;
  if (isSpotify && source.id && source.uri?.startsWith("spotify:track:")) return source.id;
  if (side === "tidal" && hit?.tidalTrackId) return hit.tidalTrackId;

  // Negative Cache Check: If searched within last 7 days and was not found, avoid repeat search
  if (isSpotify && hit?.spotifyNotFound === 1 && hit.spotifySearchedAt) {
    const age = Date.now() - new Date(hit.spotifySearchedAt).getTime();
    if (age < 7 * 24 * 60 * 60 * 1000) return null;
  }
  if (side === "tidal" && hit?.tidalNotFound === 1 && hit.tidalSearchedAt) {
    const age = Date.now() - new Date(hit.tidalSearchedAt).getTime();
    if (age < 7 * 24 * 60 * 60 * 1000) return null;
  }

  await onProgress?.({
    currentTrack: `${source.title} — ${source.artists.join(", ")}`,
    message: `Abgleich: ${source.title} von ${source.artists[0] || "Unbekannt"}`,
  });

  const found = isSpotify
    ? await searchSpotifyTrack(source, side as "spotify" | "spotify_2")
    : await searchTidalTrack(source);

  if (!found) {
    // Record negative cache hit so future cron passes don't re-search needlessly
    if (hit) {
      await db
        .update(schema.trackMatches)
        .set({
          [isSpotify ? "spotifyNotFound" : "tidalNotFound"]: 1,
          [isSpotify ? "spotifySearchedAt" : "tidalSearchedAt"]: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.trackMatches.id, hit.id));
    } else {
      await db.insert(schema.trackMatches).values({
        canonicalKey: key,
        isrc: source.isrc || null,
        title: source.title,
        artists: source.artists,
        durationMs: source.durationMs,
        spotifyTrackId: isSpotify ? null : source.id,
        tidalTrackId: side === "tidal" ? null : source.id,
        spotifyNotFound: isSpotify ? 1 : 0,
        tidalNotFound: side === "tidal" ? 1 : 0,
        spotifySearchedAt: isSpotify ? new Date() : null,
        tidalSearchedAt: side === "tidal" ? new Date() : null,
      });
    }
    return null;
  }

  const existing = hit;
  if (existing) {
    await db
      .update(schema.trackMatches)
      .set({
        spotifyTrackId: isSpotify ? found.id : existing.spotifyTrackId,
        tidalTrackId: side === "tidal" ? found.id : existing.tidalTrackId,
        isrc: existing.isrc || found.isrc || source.isrc || null,
        spotifyNotFound: isSpotify ? 0 : existing.spotifyNotFound,
        tidalNotFound: side === "tidal" ? 0 : existing.tidalNotFound,
        updatedAt: new Date(),
      })
      .where(eq(schema.trackMatches.id, existing.id));
  } else {
    await db.insert(schema.trackMatches).values({
      canonicalKey: key,
      isrc: source.isrc || found.isrc || null,
      title: source.title,
      artists: source.artists,
      durationMs: source.durationMs,
      spotifyTrackId: isSpotify ? found.id : source.id,
      tidalTrackId: side === "tidal" ? found.id : source.id,
    });
  }

  return found.id;
}

async function toSideMap(
  tracks: NormalizedTrack[],
  side: "spotify" | "spotify_2" | "tidal",
): Promise<SideMap> {
  const map: SideMap = new Map();
  for (const t of tracks) {
    const key = canonicalKey(t);
    map.set(key, t);
    await upsertMatch(key, t, side);
  }
  return map;
}

export type ReconcileState = {
  db: Awaited<ReturnType<typeof getDb>>;
  pair: typeof schema.playlistPairs.$inferSelect;
  isSpotifySpotify: boolean;
  sideAAccount: "spotify";
  sideBAccount: "spotify_2" | "tidal";
  sideAName: string;
  sideBName: string;
  syncMode: string;
  sideAMap: SideMap;
  sideBMap: SideMap;
  desired: Set<string>;
  addToSideA: string[];
  addToSideB: string[];
  removeFromSideA: string[];
  removeFromSideB: string[];
  heldRemovals: Array<{ title: string; artists: string[]; from: string }>;
};

async function loadReconcileState(
  pairId: string,
  opts?: { forceMirror?: boolean },
): Promise<ReconcileState> {
  const db = await getDb();
  const pairs = await db
    .select()
    .from(schema.playlistPairs)
    .where(eq(schema.playlistPairs.id, pairId))
    .limit(1);
  const pair = pairs[0];
  if (!pair) throw new Error("Playlist pair not found");

  const isSpotifySpotify = pair.pairType === "spotify_spotify";
  const sideAAccount = "spotify" as const;
  const sideBAccount = (isSpotifySpotify ? "spotify_2" : "tidal") as "spotify_2" | "tidal";
  const sideAName = "Spotify (Hauptaccount)";
  const sideBName = isSpotifySpotify ? "Spotify (Account 2)" : "Tidal";

  const sideAPlaylistId = pair.spotifyPlaylistId;
  const sideBPlaylistId = isSpotifySpotify ? pair.spotify2PlaylistId : pair.tidalPlaylistId;

  if (!sideAPlaylistId) {
    throw new Error("Quelle (Spotify 1) Playlist-ID fehlt");
  }
  if (!sideBPlaylistId) {
    throw new Error(`Ziel (${sideBName}) Playlist-ID fehlt`);
  }

  // Load tracks from both sides concurrently
  const [sideATracks, sideBTracks] = await Promise.all([
    getSpotifyPlaylistTracks(sideAPlaylistId, "spotify"),
    isSpotifySpotify
      ? getSpotifyPlaylistTracks(sideBPlaylistId, "spotify_2")
      : getTidalPlaylistTracks(sideBPlaylistId),
  ]);

  const snapRows = await db
    .select()
    .from(schema.snapshots)
    .where(eq(schema.snapshots.pairId, pairId))
    .orderBy(desc(schema.snapshots.createdAt))
    .limit(1);
  const snapshot = new Set(snapRows[0]?.trackKeys || []);
  const syncMode = pair.syncMode || "additive";

  // SAFETY RAIL 1: Empty-read guard.
  // A brand-new destination playlist is empty on purpose — that is the first copy.
  // Abort only when a side that already synced comes back empty (API glitch would
  // otherwise wipe the other side), or when this mode would delete a populated
  // side because its master read failed before any snapshot exists.
  const previouslySynced = snapshot.size > 3;
  if (sideATracks.length === 0 && (previouslySynced || (sideBTracks.length > 3 && syncMode === "one_way_a_to_b"))) {
    throw new Error(
      "Sicherheitsabbruch: Leere Trackliste auf Seite A (Spotify) erhalten. Möglicher API-Glitch. Sync zum Schutz gestoppt.",
    );
  }
  if (
    sideBTracks.length === 0 &&
    (previouslySynced || (sideATracks.length > 3 && syncMode === "one_way_b_to_a"))
  ) {
    throw new Error(
      `Sicherheitsabbruch: Leere Trackliste auf ${sideBName} erhalten. Möglicher API-Glitch. Sync zum Schutz gestoppt.`,
    );
  }

  const sideAMap = await toSideMap(sideATracks, sideAAccount);
  const sideBMap = await toSideMap(sideBTracks, sideBAccount);

  const sideAKeys = new Set(sideAMap.keys());
  const sideBKeys = new Set(sideBMap.keys());

  const sideAAdded = [...sideAKeys].filter((k) => !snapshot.has(k));
  const sideARemoved = [...snapshot].filter((k) => !sideAKeys.has(k));
  const sideBAdded = [...sideBKeys].filter((k) => !snapshot.has(k));
  const sideBRemoved = [...snapshot].filter((k) => !sideBKeys.has(k));

  const desired = new Set(snapshot);
  for (const k of sideARemoved) desired.delete(k);
  for (const k of sideBRemoved) desired.delete(k);
  for (const k of sideAAdded) desired.add(k);
  for (const k of sideBAdded) desired.add(k);

  if (snapshot.size === 0) {
    desired.clear();
    for (const k of sideAKeys) desired.add(k);
    for (const k of sideBKeys) desired.add(k);
  }

  let addToSideA: string[] = [];
  let addToSideB: string[] = [];
  let removeFromSideA: string[] = [];
  let removeFromSideB: string[] = [];

  if (syncMode === "additive" || syncMode === "one_way_a_to_b") {
    // Quelle → Ziel: Spotify is only read. Missing tracks are added to the destination.
    // A new empty destination is the normal first copy. Nothing is deleted here.
    addToSideA = [];
    removeFromSideA = [];
    addToSideB = [...sideAKeys].filter((k) => !sideBKeys.has(k));
    removeFromSideB = [];
  } else if (syncMode === "one_way_b_to_a") {
    // Master-Replica: Side B is master. Side A follows 1:1. Side B never modified.
    addToSideB = [];
    removeFromSideB = [];
    addToSideA = [...sideBKeys].filter((k) => !sideAKeys.has(k));
    removeFromSideA = [...sideAKeys].filter((k) => !sideBKeys.has(k));
  } else {
    // Mirror: Two-way mirror (additions & deletions propagate)
    addToSideA = [...desired].filter((k) => !sideAKeys.has(k));
    addToSideB = [...desired].filter((k) => !sideBKeys.has(k));
    removeFromSideA = [...sideAKeys].filter((k) => !desired.has(k));
    removeFromSideB = [...sideBKeys].filter((k) => !desired.has(k));
  }

  // SAFETY RAIL 2: MAX_REMOVALS Cap / Notbremse (SongMirror)
  // If more than 20 tracks would be removed at once and user hasn't explicitly force-confirmed,
  // hold the removals back to prevent accidental mass deletion.
  const heldRemovals: Array<{ title: string; artists: string[]; from: string }> = [];
  const totalRemovals = removeFromSideA.length + removeFromSideB.length;
  const isCapped = totalRemovals > 20 && !opts?.forceMirror;

  if (isCapped) {
    for (const key of removeFromSideA) {
      const t = sideAMap.get(key);
      if (t) heldRemovals.push({ title: t.title, artists: t.artists, from: sideAName });
    }
    for (const key of removeFromSideB) {
      const t = sideBMap.get(key);
      if (t) heldRemovals.push({ title: t.title, artists: t.artists, from: sideBName });
    }
    // Suppress deletions for this automated run
    removeFromSideA = [];
    removeFromSideB = [];
  }

  return {
    db,
    pair,
    isSpotifySpotify,
    sideAAccount,
    sideBAccount,
    sideAName,
    sideBName,
    syncMode,
    sideAMap,
    sideBMap,
    desired:
      syncMode === "additive" || syncMode === "one_way_a_to_b"
        ? sideAKeys
        : syncMode === "one_way_b_to_a"
          ? sideBKeys
          : desired,
    addToSideA,
    addToSideB,
    removeFromSideA,
    removeFromSideB,
    heldRemovals,
  };
}

export async function previewPlaylistPair(pairId: string): Promise<SyncPlan> {
  const state = await loadReconcileState(pairId, { forceMirror: true });
  const sampleAdds: SyncPlan["sampleAdds"] = [];
  for (const key of state.addToSideA.slice(0, 100)) {
    const t = state.sideBMap.get(key);
    if (t) sampleAdds.push({ title: t.title, artists: t.artists, to: state.sideAName });
  }
  for (const key of state.addToSideB.slice(0, 100)) {
    const t = state.sideAMap.get(key);
    if (t) sampleAdds.push({ title: t.title, artists: t.artists, to: state.sideBName });
  }
  const sampleRemoves: SyncPlan["sampleRemoves"] = [];
  for (const key of state.removeFromSideA.slice(0, 100)) {
    const t = state.sideAMap.get(key);
    if (t) sampleRemoves.push({ title: t.title, artists: t.artists, from: state.sideAName });
  }
  for (const key of state.removeFromSideB.slice(0, 100)) {
    const t = state.sideBMap.get(key);
    if (t) sampleRemoves.push({ title: t.title, artists: t.artists, from: state.sideBName });
  }
  return {
    syncMode: state.syncMode,
    addToSpotify: state.addToSideA.length,
    addToTidal: state.addToSideB.length,
    removeFromSpotify: state.removeFromSideA.length,
    removeFromTidal: state.removeFromSideB.length,
    sampleAdds,
    sampleRemoves,
    heldRemovals: state.heldRemovals,
    sideAName: state.sideAName,
    sideBName: state.sideBName,
  };
}

export async function syncPlaylistPair(
  pairId: string,
  onProgress?: (p: SyncProgress) => Promise<void>,
  opts?: { forceMirror?: boolean },
): Promise<SyncProgress> {
  const progress: SyncProgress = {
    total: 0,
    processed: 0,
    matched: 0,
    unmatched: 0,
    addedSpotify: 0,
    addedTidal: 0,
    removedSpotify: 0,
    removedTidal: 0,
    unmatchedTracks: [],
    heldRemovals: [],
    message: "Lade Playlists…",
  };
  await onProgress?.(progress);

  const state = await loadReconcileState(pairId, opts);
  const {
    db,
    pair,
    isSpotifySpotify,
    sideAAccount,
    sideBAccount,
    sideAName,
    sideBName,
    syncMode,
    sideAMap,
    sideBMap,
    desired,
    addToSideA,
    addToSideB,
    removeFromSideA,
    removeFromSideB,
    heldRemovals,
  } = state;

  progress.heldRemovals = heldRemovals;

  await db
    .update(schema.playlistPairs)
    .set({
      status: "syncing",
      updatedAt: new Date(),
      lastError: null,
      heldRemovals,
    })
    .where(eq(schema.playlistPairs.id, pairId));

  progress.total =
    addToSideA.length + removeFromSideA.length + addToSideB.length + removeFromSideB.length;
  progress.message =
    syncMode === "additive"
      ? "Additive Sync…"
      : syncMode.startsWith("one_way")
        ? "Einweg-Sync…"
        : "Mirror Sync…";
  await onProgress?.(progress);

  // 1. Resolve and add to Side A (Spotify 1)
  const sideAAddIds: string[] = [];
  for (const key of addToSideA) {
    const source = sideBMap.get(key);
    if (!source) continue;
    const id = await resolveIdForSide(key, source, sideAAccount, async (p) => {
      Object.assign(progress, p);
      await onProgress?.(progress);
    });
    progress.processed++;
    if (id) {
      sideAAddIds.push(id);
      progress.matched++;
      progress.addedSpotify++;
    } else {
      progress.unmatched++;
      progress.unmatchedTracks.push({
        title: source.title,
        artists: source.artists,
        side: `${sideBName}→${sideAName}`,
      });
    }
    await onProgress?.(progress);
  }
  if (sideAAddIds.length && pair.spotifyPlaylistId) {
    await addTracksToSpotifyPlaylist(pair.spotifyPlaylistId, sideAAddIds, "spotify");
  }

  // 2. Resolve and add to Side B (Tidal or Spotify 2)
  const sideBAddIds: string[] = [];
  for (const key of addToSideB) {
    const source = sideAMap.get(key);
    if (!source) continue;
    const id = await resolveIdForSide(key, source, sideBAccount, async (p) => {
      Object.assign(progress, p);
      await onProgress?.(progress);
    });
    progress.processed++;
    if (id) {
      sideBAddIds.push(id);
      progress.matched++;
      if (isSpotifySpotify) progress.addedSpotify++;
      else progress.addedTidal++;
    } else {
      progress.unmatched++;
      progress.unmatchedTracks.push({
        title: source.title,
        artists: source.artists,
        side: `${sideAName}→${sideBName}`,
      });
    }
    await onProgress?.(progress);
  }

  if (sideBAddIds.length) {
    if (isSpotifySpotify && pair.spotify2PlaylistId) {
      await addTracksToSpotifyPlaylist(pair.spotify2PlaylistId, sideBAddIds, "spotify_2");
    } else if (pair.tidalPlaylistId) {
      await addTracksToTidalPlaylist(pair.tidalPlaylistId, sideBAddIds);
    }
  }

  // 3. Remove from Side A (Spotify 1)
  const sideARemoveIds = removeFromSideA
    .map((k) => sideAMap.get(k)?.id)
    .filter(Boolean) as string[];
  if (sideARemoveIds.length && pair.spotifyPlaylistId) {
    await removeTracksFromSpotifyPlaylist(pair.spotifyPlaylistId, sideARemoveIds, "spotify");
  }
  progress.removedSpotify = sideARemoveIds.length;
  progress.processed += sideARemoveIds.length;

  // 4. Remove from Side B (Tidal or Spotify 2)
  const sideBRemoveIds = removeFromSideB
    .map((k) => sideBMap.get(k)?.id)
    .filter(Boolean) as string[];
  if (sideBRemoveIds.length) {
    if (isSpotifySpotify && pair.spotify2PlaylistId) {
      await removeTracksFromSpotifyPlaylist(pair.spotify2PlaylistId, sideBRemoveIds, "spotify_2");
    } else if (pair.tidalPlaylistId) {
      await removeTracksFromTidalPlaylist(pair.tidalPlaylistId, sideBRemoveIds);
    }
  }
  if (isSpotifySpotify) progress.removedSpotify += sideBRemoveIds.length;
  else progress.removedTidal = sideBRemoveIds.length;
  progress.processed += sideBRemoveIds.length;

  // Final desired snapshot excludes unmatched
  const finalKeys = [...desired].filter((k) => {
    const failed = progress.unmatchedTracks.some(
      (u) => canonicalKey({ title: u.title, artists: u.artists, durationMs: 0 }) === k,
    );
    return !failed;
  });

  await db.insert(schema.snapshots).values({
    pairId,
    trackKeys: finalKeys,
  });

  const songCount = finalKeys.length;
  const matchedCount = songCount - progress.unmatched;
  const progressPercent =
    progress.total === 0
      ? 100
      : Math.min(100, Math.round((progress.processed / Math.max(progress.total, 1)) * 100));

  let finalMessage = "Sync erfolgreich";
  if (heldRemovals.length > 0) {
    finalMessage = `Sync abgeschlossen (${heldRemovals.length} Löschungen von Notbremse zurückgehalten)`;
  }

  await db
    .update(schema.playlistPairs)
    .set({
      status: "idle",
      lastSyncedAt: new Date(),
      songCount,
      matchedCount: Math.max(0, matchedCount),
      unmatchedCount: progress.unmatched,
      unmatchedTracks: progress.unmatchedTracks,
      heldRemovals,
      progressPercent: progressPercent || 100,
      updatedAt: new Date(),
      lastError: heldRemovals.length > 0 ? `${heldRemovals.length} Löschungen von Notbremse zurückgehalten` : null,
    })
    .where(eq(schema.playlistPairs.id, pairId));

  progress.message = finalMessage;
  progress.currentTrack = undefined;
  await onProgress?.(progress);
  return progress;
}

export async function runSyncJob(jobId: string, opts?: { forceMirror?: boolean }) {
  const db = await getDb();
  const jobs = await db.select().from(schema.syncJobs).where(eq(schema.syncJobs.id, jobId)).limit(1);
  const job = jobs[0];
  if (!job?.pairId) throw new Error("Job missing pair");

  await db
    .update(schema.syncJobs)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(schema.syncJobs.id, jobId));

  try {
    const result = await syncPlaylistPair(
      job.pairId,
      async (p) => {
        await db
          .update(schema.syncJobs)
          .set({
            currentTrack: p.currentTrack || null,
            message: p.message || null,
            total: p.total,
            processed: p.processed,
            matched: p.matched,
            unmatched: p.unmatched,
            addedSpotify: p.addedSpotify,
            addedTidal: p.addedTidal,
            removedSpotify: p.removedSpotify,
            removedTidal: p.removedTidal,
            unmatchedTracks: p.unmatchedTracks,
          })
          .where(eq(schema.syncJobs.id, jobId));
      },
      opts,
    );

    await db
      .update(schema.syncJobs)
      .set({
        status: "completed",
        finishedAt: new Date(),
        message: result.message || "Sync abgeschlossen",
        total: result.total,
        processed: result.processed,
        matched: result.matched,
        unmatched: result.unmatched,
        addedSpotify: result.addedSpotify,
        addedTidal: result.addedTidal,
        removedSpotify: result.removedSpotify,
        removedTidal: result.removedTidal,
        unmatchedTracks: result.unmatchedTracks,
        currentTrack: null,
      })
      .where(eq(schema.syncJobs.id, jobId));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync fehlgeschlagen";
    await db
      .update(schema.syncJobs)
      .set({
        status: "failed",
        error: message,
        finishedAt: new Date(),
        message,
      })
      .where(eq(schema.syncJobs.id, jobId));
    await db
      .update(schema.playlistPairs)
      .set({ status: "error", lastError: message, updatedAt: new Date() })
      .where(eq(schema.playlistPairs.id, job.pairId));
    throw err;
  }
}
