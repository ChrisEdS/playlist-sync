import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { waitUntil } from "@vercel/functions";
import { requireAuth, jsonError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { enqueuePairSync, kickQueue } from "@/lib/sync/queue";

export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { forceMirror?: boolean };
  const forceMirror = Boolean(body?.forceMirror);

  const db = await getDb();
  const pairs = await db
    .select()
    .from(schema.playlistPairs)
    .where(eq(schema.playlistPairs.id, id))
    .limit(1);
  if (!pairs[0]) return jsonError("Not found", 404);

  const job = await enqueuePairSync(
    id,
    forceMirror ? "Eingereiht (Mirror erzwungen)…" : "Eingereiht…",
    { forceMirror },
  );
  waitUntil(kickQueue());

  return NextResponse.json({ job });
}
