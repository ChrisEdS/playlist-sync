import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, jsonError } from "@/lib/api";
import { getAppUrl } from "@/lib/env";
import {
  credentialsStatus,
  saveProviderCredentials,
} from "@/lib/providers/credentials";

const bodySchema = z.object({
  provider: z.enum(["spotify", "tidal"]),
  clientId: z.string().min(1),
  clientSecret: z.string().optional(),
});

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  const status = await credentialsStatus();
  const appUrl = getAppUrl();
  return NextResponse.json({
    credentials: status,
    redirectUris: {
      spotify: `${appUrl}/api/auth/spotify/callback`,
      tidal: `${appUrl}/api/auth/tidal/callback`,
    },
    dashboards: {
      spotify: "https://developer.spotify.com/dashboard",
      tidal: "https://developer.tidal.com",
    },
  });
}

export async function PUT(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.message);

  try {
    await saveProviderCredentials(parsed.data.provider, {
      clientId: parsed.data.clientId,
      clientSecret: parsed.data.clientSecret,
    });
    const status = await credentialsStatus();
    return NextResponse.json({ ok: true, credentials: status });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Save failed", 500);
  }
}
