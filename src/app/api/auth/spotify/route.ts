import { NextResponse } from "next/server";
import { spotifyAuthUrl, newOAuthState } from "@/lib/providers/spotify";
import { getProviderCredentials } from "@/lib/providers/credentials";
import { setOAuthState } from "@/lib/session";
import { requireAuth } from "@/lib/api";
import { getAppUrl } from "@/lib/env";

export async function GET(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  const url = new URL(req.url);
  const account = url.searchParams.get("account") === "spotify_2" ? "spotify_2" : "spotify";
  const creds = await getProviderCredentials("spotify");
  if (!creds.configured) {
    return NextResponse.redirect(new URL("/settings?error=spotify_credentials_missing", getAppUrl()));
  }
  const state = newOAuthState();
  await setOAuthState({ provider: account, state });
  // Account 2 uses showDialog=true so Spotify presents account switch/login
  return NextResponse.redirect(await spotifyAuthUrl(state, account === "spotify_2"));
}
