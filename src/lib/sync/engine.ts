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
};

type SideMap = Map<string, NormalizedTrack>;

async function upsertMatch(key: string, track: NormalizedTrack, side: "spotify" | "tidal") {
  const db = getDb();
  const existing = await db
    .select()
    .from(schema.trackMatches)
    .where(eq(schema.trackMatches.canonicalKey, key))
    .limit(1);
  const row = existing[0];
  const base = {
    canonicalKey: key,
    isrc: track.isrc || row?.isrc || null,
    title: track.title,
    artists: track.artists,
    durationMs: track.durationMs,
    spotifyTrackId: side === "spotify" ? track.id : row?.spotifyTrackId || null,
    tidalTrackId: side === "tidal" ? track.id : row?.tidalTrackId || null,
    updatedAt: new Date(),
  };
  if (row) {
    await db
      .update(schema.trackMatches)
      .set({
        ...base,
        spotifyTrackId: side === "spotify" ? track.id : row.spotifyTrackId,
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
  side: "spotify" | "tidal",
  onProgress?: (p: Partial<SyncProgress>) => Promise<void>,
): Promise<string | null> {
  const db = getDb();
  const cached = await db
    .select()
    .from(schema.trackMatches)
    .where(eq(schema.trackMatches.canonicalKey, key))
    .limit(1);
  const hit = cached[0];
  if (side === "spotify" && hit?.spotifyTrackId) return hit.spotifyTrackId;
  if (side === "tidal" && hit?.tidalTrackId) return hit.tidalTrackId;

  await onProgress?.({
    currentTrack: `${source.title} — ${source.artists.join(", ")}`,
    message: `MATCHING: ${source.title} by ${source.artists[0] || "Unknown"}`,
  });

  const found =
    side === "spotify" ? await searchSpotifyTrack(source) : await searchTidalTrack(source);
  if (!found) return null;

  const existing = hit;
  if (existing) {
    await db
      .update(schema.trackMatches)
      .set({
        spotifyTrackId: side === "spotify" ? found.id : existing.spotifyTrackId,
        tidalTrackId: side === "tidal" ? found.id : existing.tidalTrackId,
        isrc: existing.isrc || found.isrc || source.isrc || null,
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
      spotifyTrackId: side === "spotify" ? found.id : source.id,
      tidalTrackId: side === "tidal" ? found.id : source.id,
    });
  }

  return found.id;
}

async function toSideMap(
  tracks: NormalizedTrack[],
  side: "spotify" | "tidal",
): Promise<SideMap> {
  const map: SideMap = new Map();
  for (const t of tracks) {
    const key = canonicalKey(t);
    map.set(key, t);
    await upsertMatch(key, t, side);
  }
  return map;
}

export async function syncPlaylistPair(
  pairId: string,
  onProgress?: (p: SyncProgress) => Promise<void>,
): Promise<SyncProgress> {
  const db = getDb();
  const pairs = await db
    .select()
    .from(schema.playlistPairs)
    .where(eq(schema.playlistPairs.id, pairId))
    .limit(1);
  const pair = pairs[0];
  if (!pair) throw new Error("Playlist pair not found");

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
    message: "Loading playlists…",
  };
  await onProgress?.(progress);

  await db
    .update(schema.playlistPairs)
    .set({ status: "syncing", updatedAt: new Date(), lastError: null })
    .where(eq(schema.playlistPairs.id, pairId));

  const [spotifyTracks, tidalTracks] = await Promise.all([
    getSpotifyPlaylistTracks(pair.spotifyPlaylistId),
    getTidalPlaylistTracks(pair.tidalPlaylistId),
  ]);

  const spotifyMap = await toSideMap(spotifyTracks, "spotify");
  const tidalMap = await toSideMap(tidalTracks, "tidal");

  const snapRows = await db
    .select()
    .from(schema.snapshots)
    .where(eq(schema.snapshots.pairId, pairId))
    .orderBy(desc(schema.snapshots.createdAt))
    .limit(1);
  const snapshot = new Set(snapRows[0]?.trackKeys || []);

  const spotifyKeys = new Set(spotifyMap.keys());
  const tidalKeys = new Set(tidalMap.keys());

  const spotifyAdded = [...spotifyKeys].filter((k) => !snapshot.has(k));
  const spotifyRemoved = [...snapshot].filter((k) => !spotifyKeys.has(k));
  const tidalAdded = [...tidalKeys].filter((k) => !snapshot.has(k));
  const tidalRemoved = [...snapshot].filter((k) => !tidalKeys.has(k));

  const desired = new Set(snapshot);
  for (const k of spotifyRemoved) desired.delete(k);
  for (const k of tidalRemoved) desired.delete(k);
  for (const k of spotifyAdded) desired.add(k);
  for (const k of tidalAdded) desired.add(k);

  // First sync (empty snapshot): union both sides
  if (snapshot.size === 0) {
    desired.clear();
    for (const k of spotifyKeys) desired.add(k);
    for (const k of tidalKeys) desired.add(k);
  }

  const addToSpotify = [...desired].filter((k) => !spotifyKeys.has(k));
  const removeFromSpotify = [...spotifyKeys].filter((k) => !desired.has(k));
  const addToTidal = [...desired].filter((k) => !tidalKeys.has(k));
  const removeFromTidal = [...tidalKeys].filter((k) => !desired.has(k));

  progress.total =
    addToSpotify.length + removeFromSpotify.length + addToTidal.length + removeFromTidal.length;
  progress.message = "Reconciling…";
  await onProgress?.(progress);

  const spotifyAddIds: string[] = [];
  for (const key of addToSpotify) {
    const source = tidalMap.get(key);
    if (!source) continue;
    const id = await resolveIdForSide(key, source, "spotify", async (p) => {
      Object.assign(progress, p);
      await onProgress?.(progress);
    });
    progress.processed++;
    if (id) {
      spotifyAddIds.push(id);
      progress.matched++;
      progress.addedSpotify++;
    } else {
      progress.unmatched++;
      progress.unmatchedTracks.push({
        title: source.title,
        artists: source.artists,
        side: "tidal→spotify",
      });
    }
    await onProgress?.(progress);
  }
  await addTracksToSpotifyPlaylist(pair.spotifyPlaylistId, spotifyAddIds);

  const tidalAddIds: string[] = [];
  for (const key of addToTidal) {
    const source = spotifyMap.get(key);
    if (!source) continue;
    const id = await resolveIdForSide(key, source, "tidal", async (p) => {
      Object.assign(progress, p);
      await onProgress?.(progress);
    });
    progress.processed++;
    if (id) {
      tidalAddIds.push(id);
      progress.matched++;
      progress.addedTidal++;
    } else {
      progress.unmatched++;
      progress.unmatchedTracks.push({
        title: source.title,
        artists: source.artists,
        side: "spotify→tidal",
      });
    }
    await onProgress?.(progress);
  }
  await addTracksToTidalPlaylist(pair.tidalPlaylistId, tidalAddIds);

  const spotifyRemoveIds = removeFromSpotify
    .map((k) => spotifyMap.get(k)?.id)
    .filter(Boolean) as string[];
  await removeTracksFromSpotifyPlaylist(pair.spotifyPlaylistId, spotifyRemoveIds);
  progress.removedSpotify = spotifyRemoveIds.length;
  progress.processed += spotifyRemoveIds.length;

  const tidalRemoveIds = removeFromTidal
    .map((k) => tidalMap.get(k)?.id)
    .filter(Boolean) as string[];
  await removeTracksFromTidalPlaylist(pair.tidalPlaylistId, tidalRemoveIds);
  progress.removedTidal = tidalRemoveIds.length;
  progress.processed += tidalRemoveIds.length;

  // Desired snapshot excludes unmatched that never landed on both sides
  const finalKeys = [...desired].filter((k) => {
    const failed = progress.unmatchedTracks.some(
      (u) => canonicalKey({ title: u.title, artists: u.artists, durationMs: 0 }) === k,
    );
    return !failed;
  });

  // Rebuild from actual post-sync membership keys that we intended
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

  await db
    .update(schema.playlistPairs)
    .set({
      status: progress.unmatched ? "idle" : "idle",
      lastSyncedAt: new Date(),
      songCount,
      matchedCount: Math.max(0, matchedCount),
      unmatchedCount: progress.unmatched,
      progressPercent: progressPercent || 100,
      updatedAt: new Date(),
      lastError: null,
    })
    .where(eq(schema.playlistPairs.id, pairId));

  progress.message = "Sync complete";
  progress.currentTrack = undefined;
  await onProgress?.(progress);
  return progress;
}

export async function runSyncJob(jobId: string) {
  const db = getDb();
  const jobs = await db.select().from(schema.syncJobs).where(eq(schema.syncJobs.id, jobId)).limit(1);
  const job = jobs[0];
  if (!job?.pairId) throw new Error("Job missing pair");

  await db
    .update(schema.syncJobs)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(schema.syncJobs.id, jobId));

  try {
    const result = await syncPlaylistPair(job.pairId, async (p) => {
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
    });

    await db
      .update(schema.syncJobs)
      .set({
        status: "completed",
        finishedAt: new Date(),
        message: result.message || "Sync complete",
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
    const message = err instanceof Error ? err.message : "Sync failed";
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
