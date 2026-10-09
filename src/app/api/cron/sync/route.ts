import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { waitUntil } from "@vercel/functions";
import { env } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { runSyncJob } from "@/lib/sync/engine";

export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = env.cronSecret;
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const pairs = await db
    .select()
    .from(schema.playlistPairs)
    .where(and(eq(schema.playlistPairs.enabled, 1)));

  const jobs = [];
  for (const pair of pairs) {
    if (pair.status === "syncing") continue;
    const [job] = await db
      .insert(schema.syncJobs)
      .values({
        pairId: pair.id,
        type: "sync",
        status: "queued",
        message: "Cron sync…",
      })
      .returning();
    jobs.push(job);
    waitUntil(
      runSyncJob(job.id).catch((err) => {
        console.error("Cron sync failed", pair.id, err);
      }),
    );
  }

  return NextResponse.json({ ok: true, queued: jobs.length, jobIds: jobs.map((j) => j.id) });
}
