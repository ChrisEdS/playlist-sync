import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, jsonError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { createSpotifyPlaylist } from "@/lib/providers/spotify";
import { createTidalPlaylist } from "@/lib/providers/tidal";
import { syncModeFromSource } from "@/lib/sync/modes";

export const maxDuration = 300;

const createSchema = z.object({
  name: z.string().min(1).optional(),
  pairType: z.enum(["spotify_tidal", "spotify_spotify"]).default("spotify_tidal"),
  source: z.enum(["spotify", "spotify_2", "tidal"]),
  sourcePlaylistId: z.string().min(1),
  sourcePlaylistName: z.string().min(1),
  sourcePlaylistUrl: z.string().optional(),
  coverImage: z.string().optional(),
  targetPlaylistId: z.string().optional(),
  createTarget: z.boolean().optional(),
  syncMode: z
    .enum(["additive", "additive_b_to_a", "mirror", "one_way_a_to_b", "one_way_b_to_a"])
    .optional(),
});

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  const db = await getDb();
  const pairs = await db
    .select()
    .from(schema.playlistPairs)
    .orderBy(desc(schema.playlistPairs.createdAt));
  return NextResponse.json({ pairs });
}

export async function POST(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.message);

  const data = parsed.data;
  const name = data.name || data.sourcePlaylistName;
  const pairType = data.pairType || (data.source === "spotify_2" ? "spotify_spotify" : "spotify_tidal");

  let spotifyPlaylistId: string | null = null;
  let tidalPlaylistId: string | null = null;
  let spotify2PlaylistId: string | null = null;

  let spotifyPlaylistUrl: string | null = null;
  let tidalPlaylistUrl: string | null = null;
  let spotify2PlaylistUrl: string | null = null;

  try {
    if (pairType === "spotify_spotify") {
      if (data.source === "spotify") {
        spotifyPlaylistId = data.sourcePlaylistId;
        spotifyPlaylistUrl = data.sourcePlaylistUrl || null;
        if (data.targetPlaylistId) {
          spotify2PlaylistId = data.targetPlaylistId;
        } else {
          const created = await createSpotifyPlaylist(name, undefined, "spotify_2");
          spotify2PlaylistId = created.id;
          spotify2PlaylistUrl = created.url || null;
        }
      } else {
        spotify2PlaylistId = data.sourcePlaylistId;
        spotify2PlaylistUrl = data.sourcePlaylistUrl || null;
        if (data.targetPlaylistId) {
          spotifyPlaylistId = data.targetPlaylistId;
        } else {
          const created = await createSpotifyPlaylist(name, undefined, "spotify");
          spotifyPlaylistId = created.id;
          spotifyPlaylistUrl = created.url || null;
        }
      }
    } else {
      // spotify_tidal
      if (data.source === "spotify") {
        spotifyPlaylistId = data.sourcePlaylistId;
        spotifyPlaylistUrl = data.sourcePlaylistUrl || null;
        if (data.targetPlaylistId) {
          tidalPlaylistId = data.targetPlaylistId;
        } else {
          const created = await createTidalPlaylist(name);
          tidalPlaylistId = created.id;
          tidalPlaylistUrl = created.url || null;
        }
      } else {
        tidalPlaylistId = data.sourcePlaylistId;
        tidalPlaylistUrl = data.sourcePlaylistUrl || null;
        if (data.targetPlaylistId) {
          spotifyPlaylistId = data.targetPlaylistId;
        } else {
          const created = await createSpotifyPlaylist(name, undefined, "spotify");
          spotifyPlaylistId = created.id;
          spotifyPlaylistUrl = created.url || null;
        }
      }
    }

    const db = await getDb();
    const [pair] = await db
      .insert(schema.playlistPairs)
      .values({
        name,
        pairType,
        spotifyPlaylistId,
        tidalPlaylistId,
        spotify2PlaylistId,
        spotifyPlaylistUrl,
        tidalPlaylistUrl,
        spotify2PlaylistUrl,
        coverImages: data.coverImage ? [data.coverImage] : [],
        syncMode:
          data.syncMode === "mirror" ||
          data.syncMode === "additive_b_to_a" ||
          data.syncMode === "one_way_b_to_a" ||
          data.syncMode === "one_way_a_to_b"
            ? data.syncMode
            : syncModeFromSource(data.source, data.syncMode || "additive"),
        status: "idle",
        progressPercent: 0,
      })
      .returning();

    return NextResponse.json({ pair }, { status: 201 });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Paar-Erstellung fehlgeschlagen", 500);
  }
}
