import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, jsonError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

export const maxDuration = 300;

const batchSchema = z.object({
  pairs: z
    .array(
      z.object({
        name: z.string().min(1),
        pairType: z.enum(["spotify_tidal", "spotify_spotify"]).default("spotify_tidal"),
        spotifyPlaylistId: z.string().optional(),
        tidalPlaylistId: z.string().optional(),
        spotify2PlaylistId: z.string().optional(),
        spotifyPlaylistUrl: z.string().optional(),
        tidalPlaylistUrl: z.string().optional(),
        spotify2PlaylistUrl: z.string().optional(),
        coverImage: z.string().optional(),
        syncMode: z
          .enum(["additive", "mirror", "one_way_a_to_b", "one_way_b_to_a"])
          .default("additive"),
      }),
    )
    .min(1),
});

export async function POST(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const parsed = batchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.message);

  const db = await getDb();
  const created = [];

  for (const item of parsed.data.pairs) {
    const [row] = await db
      .insert(schema.playlistPairs)
      .values({
        name: item.name,
        pairType: item.pairType || "spotify_tidal",
        spotifyPlaylistId: item.spotifyPlaylistId || null,
        tidalPlaylistId: item.tidalPlaylistId || null,
        spotify2PlaylistId: item.spotify2PlaylistId || null,
        spotifyPlaylistUrl: item.spotifyPlaylistUrl || null,
        tidalPlaylistUrl: item.tidalPlaylistUrl || null,
        spotify2PlaylistUrl: item.spotify2PlaylistUrl || null,
        coverImages: item.coverImage ? [item.coverImage] : [],
        syncMode: item.syncMode || "additive",
        status: "idle",
        progressPercent: 0,
      })
      .returning();
    created.push(row);
  }

  return NextResponse.json({ ok: true, createdCount: created.length, pairs: created }, { status: 201 });
}
