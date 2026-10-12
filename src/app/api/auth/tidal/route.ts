import { NextResponse } from "next/server";
import { createTidalAuth } from "@/lib/providers/tidal";
import { getProviderCredentials } from "@/lib/providers/credentials";
import { setOAuthState } from "@/lib/session";
import { requireAuth } from "@/lib/api";
import { getAppUrl } from "@/lib/env";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  const creds = await getProviderCredentials("tidal");
  if (!creds.configured) {
    return NextResponse.redirect(
      new URL("/settings?error=tidal_credentials_missing", getAppUrl()),
    );
  }
  const auth = await createTidalAuth();
  await setOAuthState({
    provider: "tidal",
    state: auth.state,
    codeVerifier: auth.codeVerifier,
  });
  return NextResponse.redirect(auth.url);
}
