import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAuth, jsonError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

type Params = { params: Promise<{ provider: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { provider } = await params;
  if (provider !== "spotify" && provider !== "tidal") {
    return jsonError("Invalid provider", 400);
  }
  const db = await getDb();
  await db.delete(schema.oauthAccounts).where(eq(schema.oauthAccounts.provider, provider));
  return NextResponse.json({ ok: true });
}
