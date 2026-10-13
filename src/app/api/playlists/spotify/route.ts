import { NextResponse } from "next/server";
import { requireAuth, jsonError } from "@/lib/api";
import { listSpotifyPlaylists } from "@/lib/providers/spotify";


export async function GET(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  const url = new URL(req.url);
  const account = url.searchParams.get("account") === "spotify_2" ? "spotify_2" : "spotify";
  try {
    const playlists = await listSpotifyPlaylists(account);
    return NextResponse.json({ playlists });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to list Spotify playlists", 500);
  }
}
