import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "../crypto";
import { getDb, schema } from "../db";
import { env } from "../env";
import type { ServiceProvider } from "./types";

export type ProviderAppCredentials = {
  clientId: string;
  clientSecret: string;
  source: "database" | "env" | "none";
  configured: boolean;
};

export async function getProviderCredentials(
  provider: ServiceProvider,
): Promise<ProviderAppCredentials> {
  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(schema.providerApps)
      .where(eq(schema.providerApps.provider, provider))
      .limit(1);
    const row = rows[0];
    if (row?.clientIdEnc) {
      const clientId = decrypt(row.clientIdEnc);
      const clientSecret = row.clientSecretEnc ? decrypt(row.clientSecretEnc) : "";
      if (clientId) {
        return {
          clientId,
          clientSecret,
          source: "database",
          configured: provider === "tidal" ? Boolean(clientId) : Boolean(clientId && clientSecret),
        };
      }
    }
  } catch {
    // DB unavailable — fall through to env
  }

  if (provider === "spotify") {
    const clientId = env.spotifyClientId;
    const clientSecret = env.spotifyClientSecret;
    return {
      clientId,
      clientSecret,
      source: clientId ? "env" : "none",
      configured: Boolean(clientId && clientSecret),
    };
  }

  const clientId = env.tidalClientId;
  const clientSecret = env.tidalClientSecret;
  return {
    clientId,
    clientSecret,
    source: clientId ? "env" : "none",
    configured: Boolean(clientId),
  };
}

export async function saveProviderCredentials(
  provider: ServiceProvider,
  input: { clientId: string; clientSecret?: string },
) {
  const clientId = input.clientId.trim();
  if (!clientId) throw new Error("Client ID is required");

  const db = await getDb();
  const existing = await db
    .select()
    .from(schema.providerApps)
    .where(eq(schema.providerApps.provider, provider))
    .limit(1);
  const secretInput = input.clientSecret?.trim() || "";
  const keepSecret = !secretInput && existing[0]?.clientSecretEnc;
  const clientSecretEnc = secretInput
    ? encrypt(secretInput)
    : keepSecret
      ? existing[0]!.clientSecretEnc
      : null;

  if (provider === "spotify" && !clientSecretEnc) {
    throw new Error("Spotify Client Secret is required");
  }

  const values = {
    provider,
    clientIdEnc: encrypt(clientId),
    clientSecretEnc,
    updatedAt: new Date(),
  };

  await db
    .insert(schema.providerApps)
    .values(values)
    .onConflictDoUpdate({
      target: schema.providerApps.provider,
      set: {
        clientIdEnc: values.clientIdEnc,
        clientSecretEnc: values.clientSecretEnc,
        updatedAt: values.updatedAt,
      },
    });
}

export async function credentialsStatus() {
  const [spotify, tidal] = await Promise.all([
    getProviderCredentials("spotify"),
    getProviderCredentials("tidal"),
  ]);
  return {
    spotify: {
      configured: spotify.configured,
      source: spotify.source,
      clientIdHint: maskId(spotify.clientId),
      hasSecret: Boolean(spotify.clientSecret),
    },
    tidal: {
      configured: tidal.configured,
      source: tidal.source,
      clientIdHint: maskId(tidal.clientId),
      hasSecret: Boolean(tidal.clientSecret),
    },
  };
}

function maskId(id: string): string {
  if (!id) return "";
  if (id.length <= 8) return "••••";
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}
