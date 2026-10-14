import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, jsonError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().min(1).optional(),
  syncMode: z
    .enum(["additive", "additive_b_to_a", "mirror", "one_way_a_to_b", "one_way_b_to_a"])
    .optional(),
});

export async function GET(_req: Request, { params }: Params) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await params;
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.playlistPairs)
    .where(eq(schema.playlistPairs.id, id))
    .limit(1);
  if (!rows[0]) return jsonError("Not found", 404);
  const jobs = await db
    .select()
    .from(schema.syncJobs)
    .where(eq(schema.syncJobs.pairId, id))
    .orderBy(desc(schema.syncJobs.createdAt))
    .limit(10);
  return NextResponse.json({ pair: rows[0], jobs });
}

export async function PATCH(req: Request, { params }: Params) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.message);
  const body = parsed.data;
  const db = await getDb();
  const [pair] = await db
    .update(schema.playlistPairs)
    .set({
      ...(body.name ? { name: body.name } : {}),
      ...(typeof body.enabled === "boolean" ? { enabled: body.enabled ? 1 : 0 } : {}),
      ...(body.syncMode ? { syncMode: body.syncMode } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.playlistPairs.id, id))
    .returning();
  if (!pair) return jsonError("Not found", 404);
  return NextResponse.json({ pair });
}

export async function DELETE(_req: Request, { params }: Params) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await params;
  const db = await getDb();
  await db.delete(schema.playlistPairs).where(eq(schema.playlistPairs.id, id));
  return NextResponse.json({ ok: true });
}
