"use client";

import { useCallback, useEffect, useState } from "react";
import { formatApiError } from "@/lib/format-error";

export type StatusPayload = {
  connections: {
    spotify: { connected: boolean; displayName?: string | null };
    tidal: { connected: boolean; displayName?: string | null };
  };
  credentials?: {
    spotify: { configured: boolean };
    tidal: { configured: boolean };
  };
  setup?: {
    spotifyKeys: boolean;
    tidalKeys: boolean;
    spotifyConnected: boolean;
    tidalConnected: boolean;
    hasPairs: boolean;
    pinDisabled: boolean;
    ready: boolean;
  };
  pairs: Array<{
    id: string;
    name: string;
    songCount: number;
    matchedCount: number;
    unmatchedCount: number;
    progressPercent: number;
    status: string;
    syncMode?: string;
    coverImages: string[] | null;
    lastSyncedAt: string | null;
    lastError: string | null;
    enabled: number;
    spotifyPlaylistId?: string;
    tidalPlaylistId?: string;
    spotifyPlaylistUrl?: string | null;
    tidalPlaylistUrl?: string | null;
    unmatchedTracks?: Array<{ title: string; artists: string[]; side: string }> | null;
  }>;
  jobs: Array<{
    id: string;
    pairId: string | null;
    status: string;
    currentTrack: string | null;
    message: string | null;
    total: number;
    processed: number;
    matched: number;
    unmatched: number;
  }>;
  activeJob: StatusPayload["jobs"][number] | null;
  activePair: StatusPayload["pairs"][number] | null;
  summary: {
    totalPlaylists: number;
    totalSongs: number;
    overallProgress: number;
  };
};

export function useStatus(pollMs = 2500) {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (!res.ok) {
        const body = await res.text();
        throw new Error(formatApiError(body, "Status konnte nicht geladen werden"));
      }
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(formatApiError(e, "Status konnte nicht geladen werden"));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { data, error, refresh };
}
