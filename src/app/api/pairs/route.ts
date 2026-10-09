import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, jsonError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { createSpotifyPlaylist } from "@/lib/providers/spotify";
import { createTidalPlaylist } from "@/lib/providers/tidal";
import { runSyncJob } from "@/lib/sync/engine";

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
});

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  const db = getDb();
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

    const db = getDb();
    const [pair] = await db
      .insert(schema.playlistPairs)
      .values({
        name,
        spotifyPlaylistId,
        tidalPlaylistId,
        spotifyPlaylistUrl: spotifyPlaylistUrl || null,
        tidalPlaylistUrl: tidalPlaylistUrl || null,
        coverImages: data.coverImage ? [data.coverImage] : [],
        status: "syncing",
        progressPercent: 0,
      })
      .returning();

    const [job] = await db
      .insert(schema.syncJobs)
      .values({
        pairId: pair.id,
        type: "sync",
        status: "queued",
        message: "Starting sync…",
      })
      .returning();

    // Run sync in-request (Vercel maxDuration 300s). Fire after response via waitUntil if available.
    const { waitUntil } = await import("@vercel/functions");
    waitUntil(
      runSyncJob(job.id).catch((err) => {
        console.error("Sync job failed", err);
      }),
    );

    return NextResponse.json({ pair, job }, { status: 201 });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to create pair", 500);
  }
}
