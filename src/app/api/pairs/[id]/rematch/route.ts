import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, jsonError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { canonicalKey, normalizeArtist, normalizeTitle } from "@/lib/matching";
import { addTracksToSpotifyPlaylist, searchSpotifyTracksByQuery } from "@/lib/providers/spotify";
import { addTracksToTidalPlaylist, searchTidalTracksByQuery } from "@/lib/providers/tidal";
import { isBtoA, sideLabels } from "@/lib/sync/modes";

type Params = { params: Promise<{ id: string }> };

async function loadPair(id: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.playlistPairs)
    .where(eq(schema.playlistPairs.id, id))
    .limit(1);
  return { db, pair: rows[0] };
}

function rematchTarget(pair: {
  pairType: string | null;
  syncMode: string | null;
}) {
  const spotifySpotify = pair.pairType === "spotify_spotify";
  const reverse = isBtoA(pair.syncMode);
  if (spotifySpotify) {
    return {
      search: reverse ? ("spotify" as const) : ("spotify_2" as const),
      destLabel: reverse ? sideLabels("spotify_spotify").a : sideLabels("spotify_spotify").b,
      kind: reverse ? ("spotify" as const) : ("spotify_2" as const),
    };
  }
  return {
    search: reverse ? ("spotify" as const) : ("tidal" as const),
    destLabel: reverse ? "Spotify" : "Tidal",
    kind: reverse ? ("spotify" as const) : ("tidal" as const),
  };
}

export async function GET(req: Request, { params }: Params) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await params;
  const query = new URL(req.url).searchParams.get("q")?.trim() || "";
  if (query.length < 2) return jsonError("Suchbegriff zu kurz");

  const { pair } = await loadPair(id);
  if (!pair) return jsonError("Not found", 404);

  const target = rematchTarget(pair);
  const hits =
    target.search === "tidal"
      ? await searchTidalTracksByQuery(query)
      : await searchSpotifyTracksByQuery(query, target.search);

  return NextResponse.json({
    destLabel: target.destLabel,
    hits: hits.map((hit) => ({
      id: hit.id,
      title: hit.title,
      artists: hit.artists,
      album: hit.album || null,
      durationMs: hit.durationMs,
    })),
  });
}

const saveSchema = z.object({
  title: z.string().min(1),
  artists: z.array(z.string()).default([]),
  trackId: z.string().min(1),
});

export async function POST(req: Request, { params }: Params) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await params;
  const body = saveSchema.parse(await req.json());
  const { db, pair } = await loadPair(id);
  if (!pair) return jsonError("Not found", 404);

  const target = rematchTarget(pair);
  const titleKey = normalizeTitle(body.title);
  const artistKey = normalizeArtist(body.artists);
  const rows = await db.select().from(schema.trackMatches);
  const matches = rows.filter(
    (row) => normalizeTitle(row.title) === titleKey && normalizeArtist(row.artists || []) === artistKey,
  );

  if (target.kind === "tidal") {
    if (matches.length) {
      for (const row of matches) {
        await db
          .update(schema.trackMatches)
          .set({
            tidalTrackId: body.trackId,
            tidalNotFound: 0,
            tidalSearchedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.trackMatches.id, row.id));
      }
    } else {
      await db.insert(schema.trackMatches).values({
        canonicalKey: canonicalKey({
          title: body.title,
          artists: body.artists,
          durationMs: 0,
        }),
        title: body.title,
        artists: body.artists,
        durationMs: 0,
        tidalTrackId: body.trackId,
        tidalNotFound: 0,
      });
    }
  } else {
    if (matches.length) {
      for (const row of matches) {
        await db
          .update(schema.trackMatches)
          .set({
            spotifyTrackId: body.trackId,
            updatedAt: new Date(),
          })
          .where(eq(schema.trackMatches.id, row.id));
      }
    } else {
      await db.insert(schema.trackMatches).values({
        canonicalKey: canonicalKey({
          title: body.title,
          artists: body.artists,
          durationMs: 0,
        }),
        title: body.title,
        artists: body.artists,
        durationMs: 0,
        spotifyTrackId: body.trackId,
      });
    }
  }

  if (target.kind === "spotify_2" && pair.spotify2PlaylistId) {
    await addTracksToSpotifyPlaylist(pair.spotify2PlaylistId, [body.trackId], "spotify_2");
  } else if (target.kind === "spotify" && pair.spotifyPlaylistId) {
    await addTracksToSpotifyPlaylist(pair.spotifyPlaylistId, [body.trackId], "spotify");
  } else if (target.kind === "tidal" && pair.tidalPlaylistId) {
    await addTracksToTidalPlaylist(pair.tidalPlaylistId, [body.trackId]);
  } else {
    return jsonError("Ziel-Playlist fehlt", 400);
  }

  const unmatched = (pair.unmatchedTracks || []).filter(
    (track) =>
      !(normalizeTitle(track.title) === titleKey && normalizeArtist(track.artists) === artistKey),
  );
  const [updated] = await db
    .update(schema.playlistPairs)
    .set({
      unmatchedTracks: unmatched,
      unmatchedCount: unmatched.length,
      updatedAt: new Date(),
    })
    .where(eq(schema.playlistPairs.id, pair.id))
    .returning();

  return NextResponse.json({ pair: updated, destLabel: target.destLabel });
}
