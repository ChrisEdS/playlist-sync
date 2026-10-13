import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/env";
import { exchangeSpotifyCode } from "@/lib/providers/spotify";
import { saveTokens } from "@/lib/providers/tokens";
import { consumeOAuthState, isAuthenticated } from "@/lib/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  const base = getAppUrl();

  if (err) return NextResponse.redirect(`${base}/settings?error=${encodeURIComponent(err)}`);
  if (!(await isAuthenticated())) {
    return NextResponse.redirect(`${base}/login`);
  }

  const stored = await consumeOAuthState();
  if (
    !code ||
    !stored ||
    (stored.provider !== "spotify" && stored.provider !== "spotify_2") ||
    stored.state !== state
  ) {
    return NextResponse.redirect(`${base}/settings?error=spotify_state`);
  }

  try {
    const tokens = await exchangeSpotifyCode(code);
    await saveTokens(stored.provider, tokens);
    return NextResponse.redirect(`${base}/settings?connected=${stored.provider}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : "spotify_oauth_failed";
    return NextResponse.redirect(`${base}/settings?error=${encodeURIComponent(message)}`);
  }
}
