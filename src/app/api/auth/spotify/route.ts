import { NextResponse } from "next/server";
import { spotifyAuthUrl, newOAuthState } from "@/lib/providers/spotify";
import { getProviderCredentials } from "@/lib/providers/credentials";
import { setOAuthState } from "@/lib/session";
import { requireAuth } from "@/lib/api";
import { getAppUrl } from "@/lib/env";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  const creds = await getProviderCredentials("spotify");
  if (!creds.configured) {
    return NextResponse.redirect(new URL("/settings?error=spotify_credentials_missing", getAppUrl()));
  }
  const state = newOAuthState();
  await setOAuthState({ provider: "spotify", state });
  return NextResponse.redirect(await spotifyAuthUrl(state));
}
