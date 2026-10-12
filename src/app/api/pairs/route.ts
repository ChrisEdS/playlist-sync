import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, jsonError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { createSpotifyPlaylist } from "@/lib/providers/spotify";
import { createTidalPlaylist } from "@/lib/providers/tidal";

export const maxDuration = 300;

const createSchema = z.object({
  name: z.string().min(1).optional(),
  source: z.enum(["spotify", "tidal"]),
  sourcePlaylistId: z.string().min(1),
  sourcePlaylistName: z.string().min(1),
  sourcePlaylistUrl: z.string().optional(),
  coverImage: z.string().optional(),
  targetPlaylistId: z.string().optional(),
  createTarget: z.boolean().optional(),
  syncMode: z.enum(["additive", "mirror"]).optional(),
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
  let spotifyPlaylistId: string;
  let tidalPlaylistId: string;
  let spotifyPlaylistUrl = data.source === "spotify" ? data.sourcePlaylistUrl : undefined;
  let tidalPlaylistUrl = data.source === "tidal" ? data.sourcePlaylistUrl : undefined;

  try {
    if (data.source === "spotify") {
      spotifyPlaylistId = data.sourcePlaylistId;
      if (data.targetPlaylistId) {
        tidalPlaylistId = data.targetPlaylistId;
      } else {
        const created = await createTidalPlaylist(name);
        tidalPlaylistId = created.id;
        tidalPlaylistUrl = created.url;
      }
    } else {
      tidalPlaylistId = data.sourcePlaylistId;
      if (data.targetPlaylistId) {
        spotifyPlaylistId = data.targetPlaylistId;
      } else {
        const created = await createSpotifyPlaylist(name);
        spotifyPlaylistId = created.id;
        spotifyPlaylistUrl = created.url;
      }
    }

    const db = await getDb();
    const [pair] = await db
      .insert(schema.playlistPairs)
      .values({
        name,
        spotifyPlaylistId,
        tidalPlaylistId,
        spotifyPlaylistUrl: spotifyPlaylistUrl || null,
        tidalPlaylistUrl: tidalPlaylistUrl || null,
        coverImages: data.coverImage ? [data.coverImage] : [],
        syncMode: data.syncMode || "additive",
        status: "idle",
        progressPercent: 0,
      })
      .returning();

    // Do not auto-sync — client shows preview then starts sync.
    return NextResponse.json({ pair }, { status: 201 });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to create pair", 500);
  }
}
