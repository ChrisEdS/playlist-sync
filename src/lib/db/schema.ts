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

/** Developer-app credentials configured in the UI (encrypted at rest). */
export const providerApps = pgTable("provider_apps", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: text("provider").notNull().unique(), // spotify | tidal
  clientIdEnc: text("client_id_enc").notNull(),
  clientSecretEnc: text("client_secret_enc"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const playlistPairs = pgTable("playlist_pairs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  /** "spotify_tidal" | "spotify_spotify" */
  pairType: text("pair_type").notNull().default("spotify_tidal"),
  spotifyPlaylistId: text("spotify_playlist_id"),
  tidalPlaylistId: text("tidal_playlist_id"),
  spotify2PlaylistId: text("spotify2_playlist_id"),
  spotifyPlaylistUrl: text("spotify_playlist_url"),
  tidalPlaylistUrl: text("tidal_playlist_url"),
  spotify2PlaylistUrl: text("spotify2_playlist_url"),
  coverImages: jsonb("cover_images").$type<string[]>().default([]),
  enabled: integer("enabled").notNull().default(1),
  /** additive (A→B) | additive_b_to_a (B→A) | mirror | legacy one_way_* */
  syncMode: text("sync_mode").notNull().default("additive"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastSpotifySnapshotId: text("last_spotify_snapshot_id"),
  lastError: text("last_error"),
  songCount: integer("song_count").notNull().default(0),
  matchedCount: integer("matched_count").notNull().default(0),
  unmatchedCount: integer("unmatched_count").notNull().default(0),
  progressPercent: integer("progress_percent").notNull().default(0),
  status: text("status").notNull().default("idle"), // idle | syncing | matching | error
  unmatchedTracks: jsonb("unmatched_tracks")
    .$type<Array<{ title: string; artists: string[]; side: string }>>()
    .default([]),
  heldRemovals: jsonb("held_removals")
    .$type<Array<{ title: string; artists: string[]; from: string }>>()
    .default([]),
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
    spotifyNotFound: integer("spotify_not_found").notNull().default(0),
    tidalNotFound: integer("tidal_not_found").notNull().default(0),
    spotifySearchedAt: timestamp("spotify_searched_at", { withTimezone: true }),
    tidalSearchedAt: timestamp("tidal_searched_at", { withTimezone: true }),
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
