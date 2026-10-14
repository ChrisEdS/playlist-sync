import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db";
import { runSyncJob } from "./engine";

const GAP_MS = 8_000;
const GAP_AFTER_429_MS = 30_000;
const DRAIN_BUDGET_MS = 240_000;
const STALE_SYNC_MS = 12 * 60_000;
const STALE_GAP_MS = 20_000;

let draining: Promise<void> | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function recoverStaleJobs() {
  const db = await getDb();
  const running = await db
    .select()
    .from(schema.syncJobs)
    .where(eq(schema.syncJobs.status, "running"))
    .limit(50);
  const now = Date.now();

  for (const job of running) {
    const started = job.startedAt ? new Date(job.startedAt).getTime() : 0;
    if (!started) continue;

    if (job.type === "gap" && now - started > STALE_GAP_MS) {
      await db.delete(schema.syncJobs).where(eq(schema.syncJobs.id, job.id));
      continue;
    }

    if (job.type !== "gap" && now - started > STALE_SYNC_MS) {
      const message = "Sync abgebrochen (Timeout). Bitte erneut starten.";
      await db
        .update(schema.syncJobs)
        .set({
          status: "failed",
          error: message,
          message,
          finishedAt: new Date(),
        })
        .where(eq(schema.syncJobs.id, job.id));
      if (job.pairId) {
        await db
          .update(schema.playlistPairs)
          .set({ status: "error", lastError: message, updatedAt: new Date() })
          .where(eq(schema.playlistPairs.id, job.pairId));
      }
    }
  }
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
    const maxAge = job.type === "gap" ? STALE_GAP_MS : STALE_SYNC_MS;
    return !started || now - started < maxAge;
  });
}

async function claimNextQueued() {
  await recoverStaleJobs();
  if (await hasActiveRunning()) return null;

  const db = await getDb();
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

async function holdGap(ms: number) {
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
    await sleep(ms);
  } finally {
    await db.delete(schema.syncJobs).where(eq(schema.syncJobs.id, gap.id));
  }
}

async function drain() {
  const started = Date.now();
  let ranOne = false;
  let nextGap = GAP_MS;
  while (Date.now() - started < DRAIN_BUDGET_MS) {
    if (ranOne) await holdGap(nextGap);
    const job = await claimNextQueued();
    if (!job) return;
    ranOne = true;
    nextGap = GAP_MS;
    try {
      await runSyncJob(job.id, { forceMirror: job.type === "sync_force" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Queued sync failed", job.id, err);
      if (message.includes("429")) nextGap = GAP_AFTER_429_MS;
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
    .where(
      and(
        eq(schema.syncJobs.pairId, pairId),
        inArray(schema.syncJobs.status, ["queued", "running"]),
      ),
    )
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
  const open = await db
    .select({ pairId: schema.syncJobs.pairId, status: schema.syncJobs.status })
    .from(schema.syncJobs)
    .where(inArray(schema.syncJobs.status, ["queued", "running"]));
  const busyIds = new Set(open.map((row) => row.pairId).filter(Boolean));

  const jobs = [];
  for (const pair of pairs) {
    if (pair.status === "syncing" || busyIds.has(pair.id)) continue;
    // Skip pairs that just hit the API limit — they need a cooldown.
    const err = (pair.lastError || "").toLowerCase();
    if (err.includes("429")) {
      const updated = pair.updatedAt ? new Date(pair.updatedAt).getTime() : 0;
      if (updated && Date.now() - updated < 10 * 60_000) continue;
    }
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
