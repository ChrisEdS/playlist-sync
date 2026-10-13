import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { env } from "@/lib/env";
import { enqueueEnabledPairs, kickQueue } from "@/lib/sync/queue";

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

  const jobs = await enqueueEnabledPairs("Cron sync…");
  waitUntil(kickQueue());

  return NextResponse.json({ ok: true, queued: jobs.length, jobIds: jobs.map((job) => job.id) });
}
