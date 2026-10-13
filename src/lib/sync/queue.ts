import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { runSyncJob } from "./engine";

const GAP_MS = 3000;
const DRAIN_BUDGET_MS = 240_000;

let draining: Promise<void> | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function hasActiveRunning() {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.syncJobs)
    .where(eq(schema.syncJobs.status, "running"))
    .limit(10);
  const now = Date.now();
  return rows.some((job) => {
    const started = job.startedAt ? new Date(job.startedAt).getTime() : 0;
    const maxAge = job.type === "gap" ? 20_000 : 15 * 60_000;
    return !started || now - started < maxAge;
  });
}

async function claimNextQueued() {
  const db = await getDb();
  const staleGaps = await db
    .select()
    .from(schema.syncJobs)
    .where(and(eq(schema.syncJobs.type, "gap"), eq(schema.syncJobs.status, "running")))
    .limit(5);
  for (const gap of staleGaps) {
    const started = gap.startedAt ? new Date(gap.startedAt).getTime() : 0;
    if (started && Date.now() - started > 20_000) {
      await db.delete(schema.syncJobs).where(eq(schema.syncJobs.id, gap.id));
    }
  }

  if (await hasActiveRunning()) return null;

  const [next] = await db
    .select()
    .from(schema.syncJobs)
    .where(eq(schema.syncJobs.status, "queued"))
    .orderBy(asc(schema.syncJobs.createdAt))
    .limit(1);
  if (!next) return null;

  const [claimed] = await db
    .update(schema.syncJobs)
    .set({ status: "running", startedAt: new Date() })
    .where(and(eq(schema.syncJobs.id, next.id), eq(schema.syncJobs.status, "queued")))
    .returning();
  return claimed ?? null;
}

async function holdGap() {
  const db = await getDb();
  const [gap] = await db
    .insert(schema.syncJobs)
    .values({
      type: "gap",
      status: "running",
      message: "Kurze Pause vor dem nächsten Paar",
      startedAt: new Date(),
    })
    .returning();
  try {
    await sleep(GAP_MS);
  } finally {
    await db.delete(schema.syncJobs).where(eq(schema.syncJobs.id, gap.id));
  }
}

async function drain() {
  const started = Date.now();
  let ranOne = false;
  while (Date.now() - started < DRAIN_BUDGET_MS) {
    if (ranOne) await holdGap();
    const job = await claimNextQueued();
    if (!job) return;
    ranOne = true;
    try {
      await runSyncJob(job.id, { forceMirror: job.type === "sync_force" });
    } catch (err) {
      console.error("Queued sync failed", job.id, err);
    }
  }
}

/** Continue the queue. Safe to call often: only one drain runs in this instance. */
export function kickQueue() {
  if (!draining) {
    draining = drain().finally(() => {
      draining = null;
    });
  }
  return draining;
}

export async function enqueuePairSync(
  pairId: string,
  message: string,
  opts?: { forceMirror?: boolean },
) {
  const db = await getDb();
  const existing = await db
    .select()
    .from(schema.syncJobs)
    .where(and(eq(schema.syncJobs.pairId, pairId), eq(schema.syncJobs.status, "queued")))
    .limit(1);
  if (existing[0]) {
    kickQueue();
    return existing[0];
  }

  const [job] = await db
    .insert(schema.syncJobs)
    .values({
      pairId,
      type: opts?.forceMirror ? "sync_force" : "sync",
      status: "queued",
      message,
    })
    .returning();
  kickQueue();
  return job;
}

export async function enqueueEnabledPairs(message: string) {
  const db = await getDb();
  const pairs = await db
    .select()
    .from(schema.playlistPairs)
    .where(eq(schema.playlistPairs.enabled, 1));
  const queued = await db
    .select({ pairId: schema.syncJobs.pairId })
    .from(schema.syncJobs)
    .where(eq(schema.syncJobs.status, "queued"));
  const queuedIds = new Set(queued.map((row) => row.pairId).filter(Boolean));

  const jobs = [];
  for (const pair of pairs) {
    if (pair.status === "syncing" || queuedIds.has(pair.id)) continue;
    const [job] = await db
      .insert(schema.syncJobs)
      .values({
        pairId: pair.id,
        type: "sync",
        status: "queued",
        message,
      })
      .returning();
    jobs.push(job);
  }
  kickQueue();
  return jobs;
}
