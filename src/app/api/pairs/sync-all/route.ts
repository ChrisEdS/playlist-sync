import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { requireAuth } from "@/lib/api";
import { enqueueEnabledPairs, kickQueue } from "@/lib/sync/queue";

export const maxDuration = 300;

export async function POST() {
  const denied = await requireAuth();
  if (denied) return denied;

  const jobs = await enqueueEnabledPairs("Nacheinander eingereiht…");
  waitUntil(kickQueue());

  return NextResponse.json({
    ok: true,
    queued: jobs.length,
    jobIds: jobs.map((job) => job.id),
  });
}
