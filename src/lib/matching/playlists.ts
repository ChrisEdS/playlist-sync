import { normalizeTitle } from "./index";

export type NamedPlaylist = {
  id: string;
  name: string;
  trackCount: number;
  imageUrl?: string;
  url?: string;
};

export type PlaylistNameMatch = {
  source: NamedPlaylist;
  target: NamedPlaylist;
  score: number; // 1 = exact normalized name
};

function tokens(name: string): Set<string> {
  return new Set(normalizeTitle(name).split(" ").filter((t) => t.length > 1));
}

/** 1 exact, ~0.55–0.99 fuzzy token overlap, 0 none */
export function scorePlaylistNames(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length);
    const longer = Math.max(na.length, nb.length);
    return 0.75 + (shorter / longer) * 0.2;
  }
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  const union = new Set([...ta, ...tb]).size;
  const jaccard = overlap / union;
  return jaccard >= 0.55 ? jaccard : 0;
}

export function findBestTargetMatch(
  source: NamedPlaylist,
  targets: NamedPlaylist[],
  usedTargetIds?: Set<string>,
): PlaylistNameMatch | null {
  let best: PlaylistNameMatch | null = null;
  for (const target of targets) {
    if (usedTargetIds?.has(target.id)) continue;
    const score = scorePlaylistNames(source.name, target.name);
    if (score < 0.55) continue;
    if (!best || score > best.score) best = { source, target, score };
  }
  return best;
}

/** Greedy 1:1 matches by score (exact names first). */
export function matchPlaylistsAcrossServices(
  sources: NamedPlaylist[],
  targets: NamedPlaylist[],
): PlaylistNameMatch[] {
  const candidates: PlaylistNameMatch[] = [];
  for (const source of sources) {
    for (const target of targets) {
      const score = scorePlaylistNames(source.name, target.name);
      if (score >= 0.55) candidates.push({ source, target, score });
    }
  }
  candidates.sort(
    (a, b) => b.score - a.score || a.source.name.localeCompare(b.source.name),
  );
  const usedSources = new Set<string>();
  const usedTargets = new Set<string>();
  const unique: PlaylistNameMatch[] = [];
  for (const m of candidates) {
    if (usedSources.has(m.source.id) || usedTargets.has(m.target.id)) continue;
    usedSources.add(m.source.id);
    usedTargets.add(m.target.id);
    unique.push(m);
  }
  return unique;
}
