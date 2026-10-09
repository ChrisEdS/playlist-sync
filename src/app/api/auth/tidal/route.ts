import { NextResponse } from "next/server";
import { createTidalAuth } from "@/lib/providers/tidal";
import { setOAuthState } from "@/lib/session";
import { requireAuth } from "@/lib/api";
import { env } from "@/lib/env";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  if (!env.tidalClientId) {
    return NextResponse.json({ error: "Tidal credentials not configured" }, { status: 500 });
  }
  const auth = createTidalAuth();
  await setOAuthState({
    provider: "tidal",
    state: auth.state,
    codeVerifier: auth.codeVerifier,
  });
  return NextResponse.redirect(auth.url);
}
