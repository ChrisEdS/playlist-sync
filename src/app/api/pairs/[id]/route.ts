import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAuth, jsonError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";


type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await params;
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.playlistPairs)
    .where(eq(schema.playlistPairs.id, id))
    .limit(1);
  if (!rows[0]) return jsonError("Not found", 404);
  return NextResponse.json({ pair: rows[0] });
}

export async function PATCH(req: Request, { params }: Params) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    enabled?: boolean;
    name?: string;
  } | null;
  const db = getDb();
  const [pair] = await db
    .update(schema.playlistPairs)
    .set({
      ...(body?.name ? { name: body.name } : {}),
      ...(typeof body?.enabled === "boolean" ? { enabled: body.enabled ? 1 : 0 } : {}),
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
  const db = getDb();
  await db.delete(schema.playlistPairs).where(eq(schema.playlistPairs.id, id));
  return NextResponse.json({ ok: true });
}
