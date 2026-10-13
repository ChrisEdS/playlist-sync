import { createHash, randomBytes } from "crypto";
import { getAppUrl } from "../env";
import { randomToken } from "../crypto";
import { findBestMatch } from "../matching";
import type { NormalizedPlaylist, NormalizedTrack, TokenBundle } from "./types";
import { getProviderCredentials } from "./credentials";
import { getDecryptedTokens, saveTokens } from "./tokens";

const AUTH = "https://login.tidal.com/authorize";
const TOKEN = "https://auth.tidal.com/v1/oauth2/token";
const API = "https://openapi.tidal.com/v2";
const SCOPES = [
  "playlists.read",
  "playlists.write",
  "collection.read",
  "collection.write",
  "search.read",
  "user.read",
].join(" ");

function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function tidalAppCreds() {
  const creds = await getProviderCredentials("tidal");
  if (!creds.configured) {
    throw new Error("Tidal Developer App is not configured — add Client ID in Settings");
  }
  return creds;
}

export async function createTidalAuth(): Promise<{
  url: string;
  state: string;
  codeVerifier: string;
}> {
  const { clientId } = await tidalAppCreds();
  const state = randomToken(16);
  const { verifier, challenge } = pkcePair();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: `${getAppUrl()}/api/auth/tidal/callback`,
    scope: SCOPES,
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  return { url: `${AUTH}?${params}`, state, codeVerifier: verifier };
}

export async function exchangeTidalCode(code: string, codeVerifier: string): Promise<TokenBundle> {
  const { clientId, clientSecret } = await tidalAppCreds();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: `${getAppUrl()}/api/auth/tidal/callback`,
    code_verifier: codeVerifier,
  });
  if (clientSecret) {
    body.set("client_secret", clientSecret);
  }
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Tidal token exchange failed: ${await res.text()}`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    user_id?: string | number;
  };
  let displayName: string | undefined;
  let countryCode: string | undefined;
  let providerUserId = data.user_id != null ? String(data.user_id) : undefined;
  try {
    const me = await tidalFetchRaw<{
      data?: { id?: string; attributes?: { username?: string; country?: string } };
    }>("/users/me", data.access_token);
    providerUserId = me.data?.id || providerUserId;
    displayName = me.data?.attributes?.username;
    countryCode = me.data?.attributes?.country;
  } catch {
    // /users/me may vary by API version; tokens still usable
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    providerUserId,
    displayName: displayName || providerUserId,
    countryCode,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<TokenBundle> {
  const { clientId, clientSecret } = await tidalAppCreds();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });
  if (clientSecret) body.set("client_secret", clientSecret);
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Tidal refresh failed: ${await res.text()}`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function getTidalAccessToken(): Promise<string> {
  const tokens = await getDecryptedTokens("tidal");
  if (!tokens) throw new Error("Tidal is not connected");
  if (tokens.expiresAt && tokens.expiresAt.getTime() > Date.now() + 60_000) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) throw new Error("Tidal refresh token missing — reconnect");
  const refreshed = await refreshAccessToken(tokens.refreshToken);
  await saveTokens("tidal", { ...tokens, ...refreshed });
  return refreshed.accessToken;
}

async function tidalFetchRaw<T>(path: string, accessToken?: string): Promise<T> {
  const token = accessToken || (await getTidalAccessToken());
  const country =
    (await getDecryptedTokens("tidal"))?.countryCode ||
    process.env.TIDAL_COUNTRY ||
    "DE";
  const sep = path.includes("?") ? "&" : "?";
  const url = path.startsWith("http") ? path : `${API}${path}${sep}countryCode=${country}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    },
  });
  if (!res.ok) throw new Error(`Tidal API ${path}: ${res.status} ${await res.text()}`);
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

type JsonApiList<T> = {
  data: T[];
  included?: Array<Record<string, unknown>>;
  links?: { next?: string | null };
};

type PlaylistResource = {
  id: string;
  type: string;
  attributes?: {
    name?: string;
    numberOfItems?: number;
    image?: { url?: string };
    externalLinks?: Array<{ href?: string }>;
  };
};

type TrackResource = {
  id: string;
  type: string;
  attributes?: {
    title?: string;
    isrc?: string;
    duration?: number;
    artists?: Array<{ name?: string }>;
    album?: { title?: string };
  };
  relationships?: {
    artists?: { data?: Array<{ id: string; type: string }> };
  };
};

function includedName(included: Array<Record<string, unknown>> | undefined, id: string): string | undefined {
  const item = included?.find((i) => i.id === id);
  const attrs = item?.attributes as { name?: string } | undefined;
  return attrs?.name;
}

function normalizePlaylist(p: PlaylistResource): NormalizedPlaylist | null {
  if (!p?.id) return null;
  if (p.type && p.type !== "playlists" && !p.attributes?.name) return null;
  return {
    id: p.id,
    name: p.attributes?.name || "Untitled",
    trackCount: p.attributes?.numberOfItems || 0,
    imageUrl: p.attributes?.image?.url,
    url: p.attributes?.externalLinks?.[0]?.href,
  };
}

async function collectPlaylistPages(startPath: string): Promise<NormalizedPlaylist[]> {
  const items: NormalizedPlaylist[] = [];
  const seen = new Set<string>();
  let path: string | null = startPath;

  while (path) {
    const page: JsonApiList<PlaylistResource> =
      await tidalFetchRaw<JsonApiList<PlaylistResource>>(path);
    const fromIncluded = (page.included || []).filter(
      (i: Record<string, unknown>) => i.type === "playlists",
    ) as PlaylistResource[];
    const candidates: PlaylistResource[] = fromIncluded.length
      ? fromIncluded
      : page.data || [];
    for (const p of candidates) {
      const normalized = normalizePlaylist(p);
      if (!normalized || seen.has(normalized.id)) continue;
      seen.add(normalized.id);
      items.push(normalized);
    }
    path = page.links?.next || null;
  }
  return items;
}

export async function listTidalPlaylists(): Promise<NormalizedPlaylist[]> {
  // Owned playlists (primary). `userCollections/.../playlists` is deprecated and 404s.
  try {
    return await collectPlaylistPages(`/playlists?filter[owners.id]=me`);
  } catch (ownedErr) {
    // Fallback: favorited playlists in My Collection
    try {
      return await collectPlaylistPages(
        `/userCollectionPlaylists/me/relationships/items?include=items`,
      );
    } catch {
      throw ownedErr instanceof Error
        ? ownedErr
        : new Error("Failed to list Tidal playlists");
    }
  }
}

export async function getTidalPlaylistTracks(playlistId: string): Promise<NormalizedTrack[]> {
  const tracks: NormalizedTrack[] = [];
  let path: string | null = `/playlists/${playlistId}/relationships/items?include=tracks,artists`;

  while (path) {
    const page: JsonApiList<TrackResource> =
      await tidalFetchRaw<JsonApiList<TrackResource>>(path);
    const trackResources =
      (page.included?.filter((i: Record<string, unknown>) => i.type === "tracks") as
        | TrackResource[]
        | undefined) || [];
    const byId = new Map(trackResources.map((t: TrackResource) => [t.id, t]));

    for (const item of page.data || []) {
      const rel = item as {
        id: string;
        type: string;
        relationships?: {
          track?: { data?: { id: string } };
          tracks?: { data?: { id: string } };
        };
      };
      const trackId =
        rel.relationships?.track?.data?.id ||
        rel.relationships?.tracks?.data?.id ||
        (item.type === "tracks" ? item.id : undefined);
      const track = (trackId && byId.get(trackId)) || (item.type === "tracks" ? item : undefined);
      if (!track?.id) continue;

      const artistIds =
        track.relationships?.artists?.data?.map((a: { id: string }) => a.id) || [];
      const artists = artistIds
        .map((id: string) => includedName(page.included, id))
        .filter(Boolean) as string[];
      const attrArtists = track.attributes?.artists
        ?.map((a: { name?: string }) => a.name)
        .filter(Boolean) as string[] | undefined;

      tracks.push({
        id: track.id,
        isrc: track.attributes?.isrc,
        title: track.attributes?.title || "Unknown",
        artists: artists.length ? artists : attrArtists || [],
        durationMs: (track.attributes?.duration || 0) * 1000,
        album: track.attributes?.album?.title,
      });
    }
    path = page.links?.next || null;
  }
  return tracks;
}

export async function createTidalPlaylist(name: string): Promise<NormalizedPlaylist> {
  const token = await getTidalAccessToken();
  const country =
    (await getDecryptedTokens("tidal"))?.countryCode || process.env.TIDAL_COUNTRY || "DE";
  const res = await fetch(`${API}/playlists?countryCode=${country}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "playlists",
        attributes: {
          name,
          description: "Synced by Music Sync",
          privacy: "PRIVATE",
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Create Tidal playlist failed: ${await res.text()}`);
  const json = (await res.json()) as { data: PlaylistResource };
  return {
    id: json.data.id,
    name: json.data.attributes?.name || name,
    trackCount: 0,
    url: json.data.attributes?.externalLinks?.[0]?.href,
  };
}

export async function addTracksToTidalPlaylist(playlistId: string, trackIds: string[]) {
  if (!trackIds.length) return;
  const token = await getTidalAccessToken();
  const country =
    (await getDecryptedTokens("tidal"))?.countryCode || process.env.TIDAL_COUNTRY || "DE";
  for (let i = 0; i < trackIds.length; i += 20) {
    const chunk = trackIds.slice(i, i + 20);
    const res = await fetch(
      `${API}/playlists/${playlistId}/relationships/items?countryCode=${country}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.api+json",
          "Content-Type": "application/vnd.api+json",
        },
        body: JSON.stringify({
          data: chunk.map((id) => ({ type: "tracks", id })),
        }),
      },
    );
    if (!res.ok) throw new Error(`Tidal add tracks failed: ${await res.text()}`);
  }
}

export async function removeTracksFromTidalPlaylist(playlistId: string, trackIds: string[]) {
  if (!trackIds.length) return;
  const token = await getTidalAccessToken();
  const country =
    (await getDecryptedTokens("tidal"))?.countryCode || process.env.TIDAL_COUNTRY || "DE";
  for (let i = 0; i < trackIds.length; i += 20) {
    const chunk = trackIds.slice(i, i + 20);
    const res = await fetch(
      `${API}/playlists/${playlistId}/relationships/items?countryCode=${country}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.api+json",
          "Content-Type": "application/vnd.api+json",
        },
        body: JSON.stringify({
          data: chunk.map((id) => ({ type: "tracks", id })),
        }),
      },
    );
    if (!res.ok) throw new Error(`Tidal remove tracks failed: ${await res.text()}`);
  }
}

export async function searchTidalTrack(track: NormalizedTrack): Promise<NormalizedTrack | null> {
  const query = track.isrc || `${track.title} ${track.artists[0] || ""}`.trim();
  const data = await tidalFetchRaw<{
    data?: TrackResource[];
    included?: Array<Record<string, unknown>>;
  }>(`/searchResults/${encodeURIComponent(query)}/relationships/tracks?include=tracks,artists`);

  const tracks =
    (data.included?.filter((i) => i.type === "tracks") as TrackResource[] | undefined) ||
    data.data ||
    [];

  const candidates: NormalizedTrack[] = tracks.map((t) => ({
    id: t.id,
    isrc: t.attributes?.isrc,
    title: t.attributes?.title || track.title,
    artists:
      (t.attributes?.artists?.map((a) => a.name).filter(Boolean) as string[]) || track.artists,
    durationMs: (t.attributes?.duration || 0) * 1000,
  }));

  const match = findBestMatch(track, candidates);
  if (match) return match;

  // Fallback: If query was ISRC and yielded no match, try searching by title + artist
  if (track.isrc) {
    const plain = `${track.title} ${track.artists[0] || ""}`.trim();
    const fallbackData = await tidalFetchRaw<{
      data?: TrackResource[];
      included?: Array<Record<string, unknown>>;
    }>(`/searchResults/${encodeURIComponent(plain)}/relationships/tracks?include=tracks,artists`);

    const fallbackTracks =
      (fallbackData.included?.filter((i) => i.type === "tracks") as TrackResource[] | undefined) ||
      fallbackData.data ||
      [];

    const fallbackCandidates: NormalizedTrack[] = fallbackTracks.map((t) => ({
      id: t.id,
      isrc: t.attributes?.isrc,
      title: t.attributes?.title || track.title,
      artists:
        (t.attributes?.artists?.map((a) => a.name).filter(Boolean) as string[]) || track.artists,
      durationMs: (t.attributes?.duration || 0) * 1000,
    }));

    return findBestMatch(track, fallbackCandidates);
  }

  return null;
}
