function required(name: string, optional = false): string {
  const value = process.env[name];
  if (!value && !optional) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value ?? "";
}

export function getAppUrl(): string {
  return (
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

export const env = {
  get appPin() {
    return required("APP_PIN");
  },
  get sessionSecret() {
    return process.env.SESSION_SECRET || required("TOKEN_ENCRYPTION_KEY");
  },
  get tokenEncryptionKey() {
    return required("TOKEN_ENCRYPTION_KEY");
  },
  get cronSecret() {
    return process.env.CRON_SECRET || "";
  },
  get databaseUrl() {
    return process.env.DATABASE_URL || "";
  },
  get spotifyClientId() {
    return process.env.SPOTIFY_CLIENT_ID || "";
  },
  get spotifyClientSecret() {
    return process.env.SPOTIFY_CLIENT_SECRET || "";
  },
  get tidalClientId() {
    return process.env.TIDAL_CLIENT_ID || "";
  },
  get tidalClientSecret() {
    return process.env.TIDAL_CLIENT_SECRET || "";
  },
};
