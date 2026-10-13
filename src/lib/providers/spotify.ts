import { getAppUrl } from "../env";
import { randomToken } from "../crypto";
import { findBestMatch } from "../matching";
import { asDurationMs, type NormalizedPlaylist, type NormalizedTrack, type SpotifyAccountSlot, type TokenBundle } from "./types";
import { getProviderCredentials } from "./credentials";
import { getDecryptedTokens, saveTokens } from "./tokens";

export type { SpotifyAccountSlot };

const AUTH = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";
const SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
  "user-library-read",
].join(" ");

async function spotifyAppCreds() {
  const creds = await getProviderCredentials("spotify");
  if (!creds.configured) {
    throw new Error("Spotify Developer App is not configured — add Client ID & Secret in Settings");
  }
  return creds;
}

export async function spotifyAuthUrl(state: string, showDialog = false): Promise<string> {
  const { clientId } = await spotifyAppCreds();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: `${getAppUrl()}/api/auth/spotify/callback`,
    scope: SCOPES,
    state,
    show_dialog: showDialog ? "true" : "false",
  });
  return `${AUTH}/authorize?${params}`;
}

export async function exchangeSpotifyCode(code: string): Promise<TokenBundle> {
  const { clientId, clientSecret } = await spotifyAppCreds();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${getAppUrl()}/api/auth/spotify/callback`,
  });
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
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
    "spotify",
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
  const { clientId, clientSecret } = await spotifyAppCreds();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
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

export async function getSpotifyAccessToken(account: SpotifyAccountSlot = "spotify"): Promise<string> {
  const tokens = await getDecryptedTokens(account);
  if (!tokens) {
    throw new Error(`${account === "spotify_2" ? "Spotify (Account 2)" : "Spotify"} ist nicht verbunden`);
  }
  if (tokens.expiresAt && tokens.expiresAt.getTime() > Date.now() + 60_000) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) {
    throw new Error(`${account === "spotify_2" ? "Spotify (Account 2)" : "Spotify"} Refresh-Token fehlt — bitte neu verbinden`);
  }
  const refreshed = await refreshAccessToken(tokens.refreshToken);
  await saveTokens(account, {
    ...tokens,
    ...refreshed,
  });
  return refreshed.accessToken;
}

async function spotifyFetch<T>(
  path: string,
  account: SpotifyAccountSlot = "spotify",
  accessToken?: string,
): Promise<T> {
  const token = accessToken || (await getSpotifyAccessToken(account));
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
    /** Preferred (newer API). */
    items?: { total?: number } | null;
    /** Deprecated — still returned by some responses. */
    tracks?: { total?: number } | null;
    images?: Array<{ url: string }>;
    external_urls?: { spotify?: string };
    owner?: { display_name?: string };
  } | null>;
  next: string | null;
  total?: number;
  limit?: number;
  offset?: number;
};

type SpotifyTracksPage = {
  items: Array<{
    added_at?: string;
    track?: {
      id: string;
      name: string;
      duration_ms: number;
      uri: string;
      external_ids?: { isrc?: string };
      artists: Array<{ name: string }>;
      album?: { name: string };
    } | null;
    item?: {
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

export async function listSpotifyPlaylists(
  account: SpotifyAccountSlot = "spotify",
): Promise<NormalizedPlaylist[]> {
  const items: NormalizedPlaylist[] = [];
  const limit = 50;
  let offset = 0;
  let total = Infinity;

  // Paginate via /me/playlists offsets — Spotify's `next` can point at the
  // removed /users/{id}/playlists endpoint (403), so we don't follow it.
  while (offset < total) {
    const page: SpotifyPlaylistPage = await spotifyFetch<SpotifyPlaylistPage>(
      `/me/playlists?limit=${limit}&offset=${offset}`,
      account,
    );
    total = typeof page.total === "number" ? page.total : offset + (page.items?.length || 0);
    for (const p of page.items || []) {
      if (!p?.id) continue;
      items.push({
        id: p.id,
        name: p.name || "Untitled",
        trackCount: p.items?.total ?? p.tracks?.total ?? 0,
        imageUrl: p.images?.[0]?.url,
        url: p.external_urls?.spotify,
        owner: p.owner?.display_name,
      });
    }
    if (!page.items?.length) break;
    offset += limit;
  }
  return items;
}

async function fetchFollowedSpotifyPlaylistTracks(playlistId: string): Promise<NormalizedTrack[]> {
  const embedRes = await fetch(`https://open.spotify.com/embed/playlist/${playlistId}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  if (!embedRes.ok) {
    throw new Error(`Spotify embed fallback failed: ${embedRes.status}`);
  }
  const html = await embedRes.text();
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
  if (!match) {
    throw new Error("Spotify embed track list could not be parsed");
  }
  const parsed = JSON.parse(match[1]);
  const entity = parsed.props?.pageProps?.state?.data?.entity;
  const trackList = entity?.trackList || [];
  return trackList.map(
    (t: { uri: string; title: string; subtitle?: string; duration?: number }) => ({
      id: t.uri.replace("spotify:track:", ""),
      title: t.title,
      artists: t.subtitle
        ? t.subtitle
            .split(/[,&]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : ["Unknown"],
      durationMs: asDurationMs(t.duration),
      uri: t.uri,
    }),
  );
}

export async function getSpotifyPlaylistTracks(
  playlistId: string,
  account: SpotifyAccountSlot = "spotify",
): Promise<NormalizedTrack[]> {
  const tracks: NormalizedTrack[] = [];
  // Use /items without restrictive field projections to avoid 403
  let url: string | null = `/playlists/${playlistId}/items?limit=100`;

  try {
    while (url) {
      const page: SpotifyTracksPage = await spotifyFetch<SpotifyTracksPage>(
        url.startsWith("http") ? url.replace(API, "") : url,
        account,
      );
      for (const item of page.items || []) {
        const t = item.track || item.item;
        if (!t?.id) continue;
        tracks.push({
          id: t.id,
          isrc: t.external_ids?.isrc,
          title: t.name,
          artists: t.artists?.map((a: { name: string }) => a.name) || [],
          durationMs: asDurationMs(t.duration_ms),
          album: t.album?.name,
          uri: t.uri,
        });
      }
      url = page.next ? page.next.replace(API, "") : null;
    }
    return tracks;
  } catch (err) {
    // If standard API returned 403 (happens on followed/non-owned playlists due to Spotify policy),
    // try the public embed fallback which reliably provides track list for public playlists.
    try {
      const fallbackTracks = await fetchFollowedSpotifyPlaylistTracks(playlistId);
      if (fallbackTracks.length > 0) return fallbackTracks;
    } catch {
      // Continue to retry legacy /tracks
    }

    // Retry legacy /tracks endpoint as secondary fallback
    try {
      url = `/playlists/${playlistId}/tracks?limit=100`;
      tracks.length = 0;
      while (url) {
        const page: SpotifyTracksPage = await spotifyFetch<SpotifyTracksPage>(
          url.startsWith("http") ? url.replace(API, "") : url,
          account,
        );
        for (const item of page.items || []) {
          const t = item.track || item.item;
          if (!t?.id) continue;
          tracks.push({
            id: t.id,
            isrc: t.external_ids?.isrc,
            title: t.name,
            artists: t.artists?.map((a: { name: string }) => a.name) || [],
            durationMs: asDurationMs(t.duration_ms),
            album: t.album?.name,
            uri: t.uri,
          });
        }
        url = page.next ? page.next.replace(API, "") : null;
      }
      return tracks;
    } catch {
      throw err;
    }
  }
}

export async function createSpotifyPlaylist(
  name: string,
  description?: string,
  account: SpotifyAccountSlot = "spotify",
): Promise<NormalizedPlaylist> {
  const me = await spotifyFetch<{ id: string }>("/me", account);
  const token = await getSpotifyAccessToken(account);
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

export async function addTracksToSpotifyPlaylist(
  playlistId: string,
  trackIds: string[],
  account: SpotifyAccountSlot = "spotify",
) {
  if (!trackIds.length) return;
  const token = await getSpotifyAccessToken(account);
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

export async function removeTracksFromSpotifyPlaylist(
  playlistId: string,
  trackIds: string[],
  account: SpotifyAccountSlot = "spotify",
) {
  if (!trackIds.length) return;
  const token = await getSpotifyAccessToken(account);
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

export async function searchSpotifyTrack(
  track: NormalizedTrack,
  account: SpotifyAccountSlot = "spotify",
): Promise<NormalizedTrack | null> {
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
  }>(`/search?type=track&limit=8&q=${encodeURIComponent(q)}`, account);

  const candidates: NormalizedTrack[] = (data.tracks?.items || []).map((item) => ({
    id: item.id,
    isrc: item.external_ids?.isrc,
    title: item.name,
    artists: item.artists.map((a) => a.name),
    durationMs: asDurationMs(item.duration_ms),
    album: item.album?.name,
    uri: item.uri,
  }));

  const match = findBestMatch(track, candidates);
  if (match) return match;

  // Fallback: If structured query with isrc/prefix didn't find a match, try plain keyword search
  if (track.isrc || q.includes("track:")) {
    const plain = `${track.title} ${track.artists[0] || ""}`.trim();
    const fallbackData = await spotifyFetch<{
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
    }>(`/search?type=track&limit=8&q=${encodeURIComponent(plain)}`, account);

    const fallbackCandidates: NormalizedTrack[] = (fallbackData.tracks?.items || []).map((item) => ({
      id: item.id,
      isrc: item.external_ids?.isrc,
      title: item.name,
      artists: item.artists.map((a) => a.name),
      durationMs: asDurationMs(item.duration_ms),
      album: item.album?.name,
      uri: item.uri,
    }));
    return findBestMatch(track, fallbackCandidates);
  }

  return null;
}

export async function searchSpotifyTracksByQuery(
  query: string,
  account: SpotifyAccountSlot = "spotify",
): Promise<NormalizedTrack[]> {
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
  }>(`/search?type=track&limit=8&q=${encodeURIComponent(query)}`, account);

  return (data.tracks?.items || []).map((item) => ({
    id: item.id,
    isrc: item.external_ids?.isrc,
    title: item.name,
    artists: item.artists.map((a) => a.name),
    durationMs: asDurationMs(item.duration_ms),
    album: item.album?.name,
    uri: item.uri,
  }));
}

export function newOAuthState(): string {
  return randomToken(16);
}
