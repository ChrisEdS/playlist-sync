import { NextResponse } from "next/server";
import { requireAuth, jsonError } from "@/lib/api";
import { previewPlaylistPair } from "@/lib/sync/engine";

export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await params;
  try {
    const plan = await previewPlaylistPair(id);
    return NextResponse.json({ plan });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Preview failed", 500);
  }
}
