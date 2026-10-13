import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAuth, jsonError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { getSpotifyPlaylistTracks } from "@/lib/providers/spotify";
import { getTidalPlaylistTracks } from "@/lib/providers/tidal";
import type { NormalizedTrack } from "@/lib/providers/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "m3u8";

  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.playlistPairs)
    .where(eq(schema.playlistPairs.id, id))
    .limit(1);
  const pair = rows[0];
  if (!pair) return jsonError("Pair not found", 404);

  let tracks: NormalizedTrack[] = [];
  try {
    if (pair.spotifyPlaylistId) {
      tracks = await getSpotifyPlaylistTracks(pair.spotifyPlaylistId, "spotify");
    } else if (pair.pairType === "spotify_spotify" && pair.spotify2PlaylistId) {
      tracks = await getSpotifyPlaylistTracks(pair.spotify2PlaylistId, "spotify_2");
    } else if (pair.tidalPlaylistId) {
      tracks = await getTidalPlaylistTracks(pair.tidalPlaylistId);
    }
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Tracks could not be loaded", 500);
  }

  const safeName = pair.name.replace(/[^a-zA-Z0-9_-]/g, "_");

  if (format === "csv") {
    const lines = ["Title,Artists,Album,DurationSec,ISRC,SpotifyURI"];
    for (const t of tracks) {
      const escape = (s?: string) => `"${(s || "").replace(/"/g, '""')}"`;
      lines.push(
        [
          escape(t.title),
          escape(t.artists.join("; ")),
          escape(t.album),
          Math.round(t.durationMs / 1000),
          escape(t.isrc),
          escape(t.uri),
        ].join(","),
      );
    }
    const csv = lines.join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}.csv"`,
      },
    });
  }

  if (format === "json") {
    return new Response(JSON.stringify({ playlist: pair.name, tracks }, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}.json"`,
      },
    });
  }

  // Default: M3U8 Playlist
  const m3uLines = ["#EXTM3U", `#PLAYLIST:${pair.name}`];
  for (const t of tracks) {
    const sec = Math.round((t.durationMs || 0) / 1000);
    const artistStr = t.artists.join(", ") || "Unknown";
    m3uLines.push(`#EXTINF:${sec},${artistStr} - ${t.title}`);
    m3uLines.push(`${artistStr} - ${t.title}.mp3`);
  }
  const m3u8 = m3uLines.join("\n");

  return new Response(m3u8, {
    headers: {
      "Content-Type": "application/x-mpegurl; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}.m3u8"`,
    },
  });
}
