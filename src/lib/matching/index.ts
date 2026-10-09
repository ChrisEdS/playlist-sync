import type { NormalizedTrack } from "../providers/types";

const NOISE =
  /\b(remaster(ed)?|remix|mix|edit|version|mono|stereo|live|bonus|deluxe|explicit|clean|radio)\b/gi;

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(NOISE, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeArtist(artists: string[]): string {
  return artists
    .map((a) => a.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .sort()
    .join(",");
}

export function canonicalKey(track: Pick<NormalizedTrack, "isrc" | "title" | "artists" | "durationMs">): string {
  if (track.isrc) return `isrc:${track.isrc.toUpperCase()}`;
  const title = normalizeTitle(track.title);
  const artists = normalizeArtist(track.artists);
  const dur = Math.round((track.durationMs || 0) / 1000);
  return `meta:${title}|${artists}|${dur}`;
}

export function tracksFuzzyEqual(a: NormalizedTrack, b: NormalizedTrack): boolean {
  if (a.isrc && b.isrc && a.isrc.toUpperCase() === b.isrc.toUpperCase()) return true;
  if (normalizeTitle(a.title) !== normalizeTitle(b.title)) return false;
  if (normalizeArtist(a.artists) !== normalizeArtist(b.artists)) return false;
  const da = a.durationMs || 0;
  const db = b.durationMs || 0;
  if (!da || !db) return true;
  return Math.abs(da - db) <= 3000;
}

export function findBestMatch(
  source: NormalizedTrack,
  candidates: NormalizedTrack[],
): NormalizedTrack | null {
  if (source.isrc) {
    const exact = candidates.find(
      (c) => c.isrc && c.isrc.toUpperCase() === source.isrc!.toUpperCase(),
    );
    if (exact) return exact;
  }
  const fuzzy = candidates.filter((c) => tracksFuzzyEqual(source, c));
  if (fuzzy.length === 1) return fuzzy[0];
  if (fuzzy.length > 1) {
    return fuzzy.sort(
      (a, b) =>
        Math.abs((a.durationMs || 0) - (source.durationMs || 0)) -
        Math.abs((b.durationMs || 0) - (source.durationMs || 0)),
    )[0];
  }
  return null;
}
