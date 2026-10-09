import { getAppUrl, env } from "../env";
import { randomToken } from "../crypto";
import type { NormalizedPlaylist, NormalizedTrack, TokenBundle } from "./types";
import { getDecryptedTokens, saveTokens } from "./tokens";

const AUTH = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";
const SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
  "user-library-read",
].join(" ");

export function spotifyAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.spotifyClientId,
    response_type: "code",
    redirect_uri: `${getAppUrl()}/api/auth/spotify/callback`,
    scope: SCOPES,
    state,
    show_dialog: "false",
  });
  return `${AUTH}/authorize?${params}`;
}

export async function exchangeSpotifyCode(code: string): Promise<TokenBundle> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${getAppUrl()}/api/auth/spotify/callback`,
  });
  const basic = Buffer.from(`${env.spotifyClientId}:${env.spotifyClientSecret}`).toString("base64");
  const res = await fetch(`${AUTH}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`Spotify token exchange failed: ${await res.text()}`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
  const me = await spotifyFetch<{ id: string; display_name?: string }>(
    "/me",
    data.access_token,
  );
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    providerUserId: me.id,
    displayName: me.display_name || me.id,
    scopes: data.scope,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<TokenBundle> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const basic = Buffer.from(`${env.spotifyClientId}:${env.spotifyClientSecret}`).toString("base64");
  const res = await fetch(`${AUTH}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`Spotify refresh failed: ${await res.text()}`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scopes: data.scope,
  };
}

export async function getSpotifyAccessToken(): Promise<string> {
  const tokens = await getDecryptedTokens("spotify");
  if (!tokens) throw new Error("Spotify is not connected");
  if (tokens.expiresAt && tokens.expiresAt.getTime() > Date.now() + 60_000) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) throw new Error("Spotify refresh token missing — reconnect");
  const refreshed = await refreshAccessToken(tokens.refreshToken);
  await saveTokens("spotify", {
    ...tokens,
    ...refreshed,
  });
  return refreshed.accessToken;
}

async function spotifyFetch<T>(path: string, accessToken?: string): Promise<T> {
  const token = accessToken || (await getSpotifyAccessToken());
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify API ${path}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

type SpotifyPlaylistPage = {
  items: Array<{
    id: string;
    name: string;
    tracks: { total: number };
    images?: Array<{ url: string }>;
    external_urls?: { spotify?: string };
    owner?: { display_name?: string };
  }>;
  next: string | null;
};

type SpotifyTracksPage = {
  items: Array<{
    track: {
      id: string;
      name: string;
      duration_ms: number;
      uri: string;
      external_ids?: { isrc?: string };
      artists: Array<{ name: string }>;
      album?: { name: string };
    } | null;
  }>;
  next: string | null;
};

export async function listSpotifyPlaylists(): Promise<NormalizedPlaylist[]> {
  const items: NormalizedPlaylist[] = [];
  let url: string | null = "/me/playlists?limit=50";
  while (url) {
    const page: SpotifyPlaylistPage = await spotifyFetch<SpotifyPlaylistPage>(
      url.startsWith("http") ? url.replace(API, "") : url,
    );
    for (const p of page.items) {
      items.push({
        id: p.id,
        name: p.name,
        trackCount: p.tracks.total,
        imageUrl: p.images?.[0]?.url,
        url: p.external_urls?.spotify,
        owner: p.owner?.display_name,
      });
    }
    url = page.next ? page.next.replace(API, "") : null;
  }
  return items;
}

export async function getSpotifyPlaylistTracks(playlistId: string): Promise<NormalizedTrack[]> {
  const tracks: NormalizedTrack[] = [];
  let url: string | null = `/playlists/${playlistId}/tracks?limit=100&fields=items(track(id,name,duration_ms,external_ids,artists(name),uri,album(name))),next`;
  while (url) {
    const page: SpotifyTracksPage = await spotifyFetch<SpotifyTracksPage>(
      url.startsWith("http") ? url.replace(API, "") : url,
    );
    for (const item of page.items) {
      const t = item.track;
      if (!t?.id) continue;
      tracks.push({
        id: t.id,
        isrc: t.external_ids?.isrc,
        title: t.name,
        artists: t.artists.map((a: { name: string }) => a.name),
        durationMs: t.duration_ms,
        album: t.album?.name,
        uri: t.uri,
      });
    }
    url = page.next ? page.next.replace(API, "") : null;
  }
  return tracks;
}

export async function createSpotifyPlaylist(name: string, description?: string): Promise<NormalizedPlaylist> {
  const me = await spotifyFetch<{ id: string }>("/me");
  const token = await getSpotifyAccessToken();
  const res = await fetch(`${API}/users/${me.id}/playlists`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      description: description || "Synced by Music Sync",
      public: false,
    }),
  });
  if (!res.ok) throw new Error(`Create Spotify playlist failed: ${await res.text()}`);
  const p = (await res.json()) as {
    id: string;
    name: string;
    external_urls?: { spotify?: string };
    images?: Array<{ url: string }>;
  };
  return {
    id: p.id,
    name: p.name,
    trackCount: 0,
    url: p.external_urls?.spotify,
    imageUrl: p.images?.[0]?.url,
  };
}

export async function addTracksToSpotifyPlaylist(playlistId: string, trackIds: string[]) {
  if (!trackIds.length) return;
  const token = await getSpotifyAccessToken();
  for (let i = 0; i < trackIds.length; i += 100) {
    const chunk = trackIds.slice(i, i + 100).map((id) => `spotify:track:${id}`);
    const res = await fetch(`${API}/playlists/${playlistId}/tracks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: chunk }),
    });
    if (!res.ok) throw new Error(`Spotify add tracks failed: ${await res.text()}`);
  }
}

export async function removeTracksFromSpotifyPlaylist(playlistId: string, trackIds: string[]) {
  if (!trackIds.length) return;
  const token = await getSpotifyAccessToken();
  for (let i = 0; i < trackIds.length; i += 100) {
    const chunk = trackIds.slice(i, i + 100).map((id) => ({ uri: `spotify:track:${id}` }));
    const res = await fetch(`${API}/playlists/${playlistId}/tracks`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tracks: chunk }),
    });
    if (!res.ok) throw new Error(`Spotify remove tracks failed: ${await res.text()}`);
  }
}

export async function searchSpotifyTrack(track: NormalizedTrack): Promise<NormalizedTrack | null> {
  const q = track.isrc
    ? `isrc:${track.isrc}`
    : `track:${track.title} artist:${track.artists[0] || ""}`;
  const data = await spotifyFetch<{
    tracks: {
      items: Array<{
        id: string;
        name: string;
        duration_ms: number;
        uri: string;
        external_ids?: { isrc?: string };
        artists: Array<{ name: string }>;
        album?: { name: string };
      }>;
    };
  }>(`/search?type=track&limit=5&q=${encodeURIComponent(q)}`);
  const first = data.tracks.items[0];
  if (!first) return null;
  return {
    id: first.id,
    isrc: first.external_ids?.isrc,
    title: first.name,
    artists: first.artists.map((a) => a.name),
    durationMs: first.duration_ms,
    album: first.album?.name,
    uri: first.uri,
  };
}

export function newOAuthState(): string {
  return randomToken(16);
}
