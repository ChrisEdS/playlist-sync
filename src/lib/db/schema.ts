import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const oauthAccounts = pgTable("oauth_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: text("provider").notNull().unique(), // spotify | tidal
  providerUserId: text("provider_user_id"),
  displayName: text("display_name"),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  scopes: text("scopes"),
  countryCode: text("country_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const playlistPairs = pgTable("playlist_pairs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  spotifyPlaylistId: text("spotify_playlist_id").notNull(),
  tidalPlaylistId: text("tidal_playlist_id").notNull(),
  spotifyPlaylistUrl: text("spotify_playlist_url"),
  tidalPlaylistUrl: text("tidal_playlist_url"),
  coverImages: jsonb("cover_images").$type<string[]>().default([]),
  enabled: integer("enabled").notNull().default(1),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastError: text("last_error"),
  songCount: integer("song_count").notNull().default(0),
  matchedCount: integer("matched_count").notNull().default(0),
  unmatchedCount: integer("unmatched_count").notNull().default(0),
  progressPercent: integer("progress_percent").notNull().default(0),
  status: text("status").notNull().default("idle"), // idle | syncing | matching | error
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const snapshots = pgTable("snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  pairId: uuid("pair_id")
    .notNull()
    .references(() => playlistPairs.id, { onDelete: "cascade" }),
  trackKeys: jsonb("track_keys").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const trackMatches = pgTable(
  "track_matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canonicalKey: text("canonical_key").notNull(),
    isrc: text("isrc"),
    title: text("title").notNull(),
    artists: jsonb("artists").$type<string[]>().notNull().default([]),
    durationMs: integer("duration_ms").notNull().default(0),
    spotifyTrackId: text("spotify_track_id"),
    tidalTrackId: text("tidal_track_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("track_matches_key_uidx").on(t.canonicalKey)],
);

export const syncJobs = pgTable("sync_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  pairId: uuid("pair_id").references(() => playlistPairs.id, { onDelete: "set null" }),
  type: text("type").notNull(), // sync | transfer
  status: text("status").notNull().default("queued"), // queued | running | completed | failed
  currentTrack: text("current_track"),
  message: text("message"),
  total: integer("total").notNull().default(0),
  processed: integer("processed").notNull().default(0),
  matched: integer("matched").notNull().default(0),
  unmatched: integer("unmatched").notNull().default(0),
  addedSpotify: integer("added_spotify").notNull().default(0),
  addedTidal: integer("added_tidal").notNull().default(0),
  removedSpotify: integer("removed_spotify").notNull().default(0),
  removedTidal: integer("removed_tidal").notNull().default(0),
  unmatchedTracks: jsonb("unmatched_tracks")
    .$type<Array<{ title: string; artists: string[]; side: string }>>()
    .default([]),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
