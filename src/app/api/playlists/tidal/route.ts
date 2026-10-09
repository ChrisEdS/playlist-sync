import { NextResponse } from "next/server";
import { requireAuth, jsonError } from "@/lib/api";
import { listTidalPlaylists } from "@/lib/providers/tidal";


export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    const playlists = await listTidalPlaylists();
    return NextResponse.json({ playlists });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to list Tidal playlists", 500);
  }
}
