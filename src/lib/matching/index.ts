import type { NormalizedTrack } from "../providers/types";

// Noise terms that commonly drift across platforms
const NOISE_PATTERN =
  /\b(remaster(ed)?(\s*\d{2,4})?|mix|radio\s*edit|edit|single\s*version|album\s*version|original\s*mix|bonus\s*track|deluxe|explicit|clean|official\s*(music\s*)?video|video|audio|lyrics?|visualizer|mono|stereo)\b/gi;

const FEAT_PATTERN = /\b(feat|ft|featuring|with)\b\.?\s+([^()[\]]+)/gi;

/** Strips accents/diacritics: "Beyoncé" -> "beyonce", "Mötley Crüe" -> "motley crue" */
export function removeDiacritics(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Extracts any extra featured artists mentioned in the title string */
export function extractFeaturedArtists(title: string): string[] {
  const extra: string[] = [];
  const matches = title.matchAll(FEAT_PATTERN);
  for (const m of matches) {
    if (m[2]) {
      const names = m[2].split(/[,&/]/).map((n) => n.trim()).filter(Boolean);
      extra.push(...names);
    }
  }
  return extra;
}

export function normalizeTitle(title: string): string {
  let cleaned = removeDiacritics(title).toLowerCase();
  // Strip (feat. ...) or [feat. ...]
  cleaned = cleaned.replace(/\((?:feat|ft|featuring|with)\.?\s+[^)]+\)/gi, " ");
  cleaned = cleaned.replace(/\[(?:feat|ft|featuring|with)\.?\s+[^\]]+\]/gi, " ");
  // Strip generic parentheticals that are often decoration
  cleaned = cleaned.replace(/\([^)]*official[^)]*\)/gi, " ");
  cleaned = cleaned.replace(/\[[^\]]*official[^\]]*\]/gi, " ");
  // Strip noise keywords
  cleaned = cleaned.replace(NOISE_PATTERN, " ");
  // Replace symbols with spaces
  cleaned = cleaned.replace(/[^a-z0-9\s]/g, " ");
  return cleaned.replace(/\s+/g, " ").trim();
}

export function normalizeArtist(artists: string[]): string {
  const names = artists
    .flatMap((a) => removeDiacritics(a).toLowerCase().split(/[,&/]/))
    .map((a) => a.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return [...new Set(names)].sort().join(",");
}

export function canonicalKey(
  track: Pick<NormalizedTrack, "isrc" | "title" | "artists" | "durationMs">,
): string {
  if (track.isrc) return `isrc:${track.isrc.toUpperCase()}`;
  const title = normalizeTitle(track.title);
  const extraArtists = extractFeaturedArtists(track.title);
  const artists = normalizeArtist([...track.artists, ...extraArtists]);
  const dur = Math.round((track.durationMs || 0) / 1000);
  return `meta:${title}|${artists}|${dur}`;
}

/**
 * Checks whether durations match within an acceptable anchor window.
 * SongMirror uses a 3-4s anchor to reject wrong-version covers, piano edits, or live tracks.
 */
export function durationAnchorMatches(
  durA: number | undefined,
  durB: number | undefined,
  maxDeltaMs = 3800,
): boolean {
  if (!durA || !durB) return true; // anchor cannot be verified if unknown
  return Math.abs(durA - durB) <= maxDeltaMs;
}

/** Returns similarity score between 0 and 1 for two token sets */
function tokenJaccard(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const setA = new Set(a.split(" ").filter((w) => w.length > 1));
  const setB = new Set(b.split(" ").filter((w) => w.length > 1));
  if (!setA.size || !setB.size) return a === b ? 1 : 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

/**
 * Evaluates whether two tracks represent the same recording.
 * Uses exact ISRC first, then duration-anchored title & artist token scoring.
 */
export function tracksFuzzyEqual(
  a: NormalizedTrack,
  b: NormalizedTrack,
  maxDurationDeltaMs = 3800,
): boolean {
  if (a.isrc && b.isrc && a.isrc.toUpperCase() === b.isrc.toUpperCase()) return true;

  // Duration Anchor: hard reject if lengths diverge by more than the tolerance window
  if (!durationAnchorMatches(a.durationMs, b.durationMs, maxDurationDeltaMs)) {
    return false;
  }

  const titleA = normalizeTitle(a.title);
  const titleB = normalizeTitle(b.title);
  const titleScore = tokenJaccard(titleA, titleB);
  if (titleScore < 0.6 && titleA !== titleB && !titleA.includes(titleB) && !titleB.includes(titleA)) {
    return false;
  }

  const artistsA = normalizeArtist([...a.artists, ...extractFeaturedArtists(a.title)]);
  const artistsB = normalizeArtist([...b.artists, ...extractFeaturedArtists(b.title)]);

  // Check if primary artist matches
  const primeA = a.artists[0] ? removeDiacritics(a.artists[0]).toLowerCase() : "";
  const primeB = b.artists[0] ? removeDiacritics(b.artists[0]).toLowerCase() : "";
  if (primeA && primeB && (artistsB.includes(primeA) || artistsA.includes(primeB))) {
    return true;
  }

  const artistScore = tokenJaccard(artistsA, artistsB);
  return artistScore >= 0.4;
}

/**
 * Picks the highest-confidence candidate from a search result list.
 */
export function findBestMatch(
  source: NormalizedTrack,
  candidates: NormalizedTrack[],
  maxDurationDeltaMs = 3800,
): NormalizedTrack | null {
  if (!candidates.length) return null;

  // 1. Exact ISRC match
  if (source.isrc) {
    const isrcUpper = source.isrc.toUpperCase();
    const exact = candidates.find((c) => c.isrc && c.isrc.toUpperCase() === isrcUpper);
    if (exact) return exact;
  }

  // 2. Filter candidates by duration anchor
  const durationFiltered = candidates.filter((c) =>
    durationAnchorMatches(source.durationMs, c.durationMs, maxDurationDeltaMs),
  );

  const pool = durationFiltered.length ? durationFiltered : candidates;

  // 3. Score fuzzy matches
  const matched = pool.filter((c) => tracksFuzzyEqual(source, c, maxDurationDeltaMs));
  if (matched.length === 1) return matched[0];

  if (matched.length > 1) {
    // Sort by smallest duration delta, then title similarity
    return matched.sort((a, b) => {
      const da = Math.abs((a.durationMs || 0) - (source.durationMs || 0));
      const db = Math.abs((b.durationMs || 0) - (source.durationMs || 0));
      return da - db;
    })[0];
  }

  return null;
}
