export type ServiceProvider = "spotify" | "spotify_2" | "tidal";
export type SpotifyAccountSlot = "spotify" | "spotify_2";

/** Postgres integer columns reject NaN/undefined. Missing durations become 0. */
export function asDurationMs(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

export type NormalizedTrack = {
  id: string;
  isrc?: string;
  title: string;
  artists: string[];
  durationMs: number;
  album?: string;
  uri?: string;
};

export type NormalizedPlaylist = {
  id: string;
  name: string;
  trackCount: number;
  imageUrl?: string;
  url?: string;
  owner?: string;
};

export type TokenBundle = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  providerUserId?: string;
  displayName?: string;
  countryCode?: string;
  scopes?: string;
};
