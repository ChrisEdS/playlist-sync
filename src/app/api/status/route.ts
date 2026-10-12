import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { requireAuth } from "@/lib/api";
import { isAppPinDisabled } from "@/lib/auth-mode";
import { getDb, schema } from "@/lib/db";
import { credentialsStatus } from "@/lib/providers/credentials";
import { connectionStatus } from "@/lib/providers/tokens";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const db = await getDb();
    const [connections, pairs, jobs, credentials] = await Promise.all([
      connectionStatus(),
      db.select().from(schema.playlistPairs).orderBy(desc(schema.playlistPairs.createdAt)),
      db.select().from(schema.syncJobs).orderBy(desc(schema.syncJobs.createdAt)).limit(20),
      credentialsStatus(),
    ]);

    const activeJob =
      jobs.find((j) => j.status === "running" || j.status === "queued") || null;
    const activePair = activeJob?.pairId
      ? pairs.find((p) => p.id === activeJob.pairId) || null
      : pairs.find((p) => p.status === "syncing" || p.status === "matching") || null;

    const totalPlaylists = pairs.length;
    const totalSongs = pairs.reduce((sum, p) => sum + (p.songCount || 0), 0);
    const overallProgress =
      totalPlaylists === 0
        ? 0
        : Math.round(
            pairs.reduce((sum, p) => sum + (p.progressPercent || 0), 0) / totalPlaylists,
          );

    const setup = {
      spotifyKeys: credentials.spotify.configured,
      tidalKeys: credentials.tidal.configured,
      spotifyConnected: Boolean(connections.spotify.connected),
      tidalConnected: Boolean(connections.tidal.connected),
      hasPairs: pairs.length > 0,
      pinDisabled: isAppPinDisabled(),
      ready:
        credentials.spotify.configured &&
        credentials.tidal.configured &&
        Boolean(connections.spotify.connected) &&
        Boolean(connections.tidal.connected),
    };

    return NextResponse.json({
      connections,
      credentials,
      pairs,
      jobs,
      activeJob,
      activePair,
      setup,
      summary: {
        totalPlaylists,
        totalSongs,
        overallProgress,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Status failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
