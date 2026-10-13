import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { waitUntil } from "@vercel/functions";
import { requireAuth, jsonError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { runSyncJob } from "@/lib/sync/engine";

export const maxDuration = 300;

export async function POST() {
  const denied = await requireAuth();
  if (denied) return denied;

  const db = await getDb();
  const pairs = await db
    .select()
    .from(schema.playlistPairs)
    .where(and(eq(schema.playlistPairs.enabled, 1)));

  if (!pairs.length) {
    return NextResponse.json({ ok: true, queued: 0, jobIds: [] });
  }

  const jobs = [];
  for (const pair of pairs) {
    if (pair.status === "syncing") continue;
    const [job] = await db
      .insert(schema.syncJobs)
      .values({
        pairId: pair.id,
        type: "sync",
        status: "queued",
        message: "Manuell eingereiht…",
      })
      .returning();
    jobs.push(job);
    waitUntil(
      runSyncJob(job.id).catch((err) => {
        console.error("Sync-all failed for pair", pair.id, err);
      }),
    );
  }

  return NextResponse.json({
    ok: true,
    queued: jobs.length,
    jobIds: jobs.map((j) => j.id),
  });
}
