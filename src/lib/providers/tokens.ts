import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "../crypto";
import { getDb, schema } from "../db";
import type { ServiceProvider, TokenBundle } from "./types";

export async function saveTokens(provider: ServiceProvider, tokens: TokenBundle) {
  const db = await getDb();
  const row = {
    provider,
    providerUserId: tokens.providerUserId ?? null,
    displayName: tokens.displayName ?? null,
    accessTokenEnc: encrypt(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    expiresAt: tokens.expiresAt ?? null,
    scopes: tokens.scopes ?? null,
    countryCode: tokens.countryCode ?? null,
    updatedAt: new Date(),
  };

  await db
    .insert(schema.oauthAccounts)
    .values(row)
    .onConflictDoUpdate({
      target: schema.oauthAccounts.provider,
      set: row,
    });
}

export async function getAccount(provider: ServiceProvider) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.oauthAccounts)
    .where(eq(schema.oauthAccounts.provider, provider))
    .limit(1);
  return rows[0] ?? null;
}

export async function getDecryptedTokens(provider: ServiceProvider): Promise<TokenBundle | null> {
  const account = await getAccount(provider);
  if (!account) return null;
  return {
    accessToken: decrypt(account.accessTokenEnc),
    refreshToken: account.refreshTokenEnc ? decrypt(account.refreshTokenEnc) : undefined,
    expiresAt: account.expiresAt ?? undefined,
    providerUserId: account.providerUserId ?? undefined,
    displayName: account.displayName ?? undefined,
    countryCode: account.countryCode ?? undefined,
    scopes: account.scopes ?? undefined,
  };
}

export async function connectionStatus() {
  const [spotify, tidal] = await Promise.all([getAccount("spotify"), getAccount("tidal")]);
  return {
    spotify: spotify
      ? { connected: true, displayName: spotify.displayName, userId: spotify.providerUserId }
      : { connected: false },
    tidal: tidal
      ? { connected: true, displayName: tidal.displayName, userId: tidal.providerUserId }
      : { connected: false },
  };
}
