import { NextResponse } from "next/server";
import { newOAuthState, spotifyAuthUrl } from "@/lib/providers/spotify";
import { setOAuthState } from "@/lib/session";
import { requireAuth } from "@/lib/api";
import { env } from "@/lib/env";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  if (!env.spotifyClientId || !env.spotifyClientSecret) {
    return NextResponse.json({ error: "Spotify credentials not configured" }, { status: 500 });
  }
  const state = newOAuthState();
  await setOAuthState({ provider: "spotify", state });
  return NextResponse.redirect(spotifyAuthUrl(state));
}
