CREATE TABLE IF NOT EXISTS "provider_apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"client_id_enc" text NOT NULL,
	"client_secret_enc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_apps_provider_unique" UNIQUE("provider")
);
--> statement-breakpoint
ALTER TABLE "playlist_pairs" ADD COLUMN IF NOT EXISTS "sync_mode" text DEFAULT 'additive' NOT NULL;--> statement-breakpoint
ALTER TABLE "playlist_pairs" ADD COLUMN IF NOT EXISTS "last_spotify_snapshot_id" text;--> statement-breakpoint
ALTER TABLE "playlist_pairs" ADD COLUMN IF NOT EXISTS "unmatched_tracks" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "playlist_pairs" ADD COLUMN IF NOT EXISTS "held_removals" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "track_matches" ADD COLUMN IF NOT EXISTS "spotify_not_found" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "track_matches" ADD COLUMN IF NOT EXISTS "tidal_not_found" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "track_matches" ADD COLUMN IF NOT EXISTS "spotify_searched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "track_matches" ADD COLUMN IF NOT EXISTS "tidal_searched_at" timestamp with time zone;
