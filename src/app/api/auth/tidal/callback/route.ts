import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/env";
import { exchangeTidalCode } from "@/lib/providers/tidal";
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
    stored.provider !== "tidal" ||
    stored.state !== state ||
    !stored.codeVerifier
  ) {
    return NextResponse.redirect(`${base}/settings?error=tidal_state`);
  }

  try {
    const tokens = await exchangeTidalCode(code, stored.codeVerifier);
    await saveTokens("tidal", tokens);
    return NextResponse.redirect(`${base}/settings?connected=tidal`);
  } catch (e) {
    const message = e instanceof Error ? e.message : "tidal_oauth_failed";
    return NextResponse.redirect(`${base}/settings?error=${encodeURIComponent(message)}`);
  }
}
