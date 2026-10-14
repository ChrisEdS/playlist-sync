/** Sync mode helpers — side A = Spotify 1, side B = Tidal or Spotify 2. */

export type SyncMode =
  | "additive"
  | "additive_b_to_a"
  | "mirror"
  | "one_way_a_to_b"
  | "one_way_b_to_a";

export type PairType = "spotify_tidal" | "spotify_spotify";

export type SourceProvider = "spotify" | "spotify_2" | "tidal";

const ADDITIVE_B_TO_A = new Set(["additive_b_to_a", "one_way_b_to_a"]);

export function isMirrorMode(mode: string | null | undefined): boolean {
  return mode === "mirror";
}

/** Quelle → Ziel with side B (Tidal / Spotify 2) as source. */
export function isBtoA(mode: string | null | undefined): boolean {
  return ADDITIVE_B_TO_A.has(mode || "");
}

/** Quelle → Ziel with side A (Spotify 1) as source (default). */
export function isAtoB(mode: string | null | undefined): boolean {
  if (isMirrorMode(mode) || isBtoA(mode)) return false;
  return true;
}

export function isAdditiveMode(mode: string | null | undefined): boolean {
  return !isMirrorMode(mode);
}

export function syncModeFromSource(
  source: SourceProvider,
  mode: "additive" | "mirror" | string,
): SyncMode {
  if (mode === "mirror") return "mirror";
  if (source === "tidal" || source === "spotify_2") return "additive_b_to_a";
  return "additive";
}

export function sourceFromSyncMode(
  pairType: PairType | string | null | undefined,
  mode: string | null | undefined,
): SourceProvider {
  if (isBtoA(mode)) {
    return pairType === "spotify_spotify" ? "spotify_2" : "tidal";
  }
  return "spotify";
}

export function sideLabels(pairType: PairType | string | null | undefined): {
  a: string;
  b: string;
} {
  if (pairType === "spotify_spotify") {
    return { a: "Spotify 1", b: "Spotify 2" };
  }
  return { a: "Spotify", b: "Tidal" };
}

/** Short badge e.g. "Spotify → Tidal" or "Mirror". */
export function directionLabel(
  pairType: PairType | string | null | undefined,
  mode: string | null | undefined,
): string {
  if (isMirrorMode(mode)) return "Mirror";
  const { a, b } = sideLabels(pairType);
  return isBtoA(mode) ? `${b} → ${a}` : `${a} → ${b}`;
}

/** Human mode name for UI chrome. */
export function modeDisplayName(
  pairType: PairType | string | null | undefined,
  mode: string | null | undefined,
): string {
  if (isMirrorMode(mode)) return "Mirror";
  return `Quelle → Ziel (${directionLabel(pairType, mode)})`;
}

export function additiveDescription(
  pairType: PairType | string | null | undefined,
  mode: string | null | undefined,
): string {
  const { a, b } = sideLabels(pairType);
  if (isBtoA(mode)) {
    return `${b} bleibt unverändert. Fehlende Titel werden nach ${a} kopiert — auch in eine neue leere Playlist.`;
  }
  return `${a} bleibt unverändert. Fehlende Titel werden nach ${b} kopiert — auch in eine neue leere Playlist.`;
}
