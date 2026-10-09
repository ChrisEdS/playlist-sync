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
  const rows = await db.select().from(schema.syncJobs).where(eq(schema.syncJobs.id, id)).limit(1);
  if (!rows[0]) return jsonError("Not found", 404);
  return NextResponse.json({ job: rows[0] });
}
