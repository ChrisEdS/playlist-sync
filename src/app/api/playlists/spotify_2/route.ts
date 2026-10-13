import { NextResponse } from "next/server";
import { requireAuth, jsonError } from "@/lib/api";
import { listSpotifyPlaylists } from "@/lib/providers/spotify";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    const playlists = await listSpotifyPlaylists("spotify_2");
    return NextResponse.json({ playlists });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to list Spotify (Account 2) playlists", 500);
  }
}
