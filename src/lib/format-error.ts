/** Turn API/JSON/provider errors into short German UI copy. */
export function formatApiError(input: unknown, fallback = "Etwas ist schiefgelaufen"): string {
  let raw =
    typeof input === "string"
      ? input
      : input instanceof Error
        ? input.message
        : fallback;

  raw = raw.trim();
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as { error?: string; message?: string };
    if (typeof parsed.error === "string") raw = parsed.error;
    else if (typeof parsed.message === "string") raw = parsed.message;
  } catch {
    // not JSON
  }

  const lower = raw.toLowerCase();

  if (lower.includes("credentials_missing") || lower.includes("not configured")) {
    return "Developer-Keys fehlen — bitte zuerst in den Settings speichern.";
  }
  if (lower.includes("not connected") || lower.includes("reconnect")) {
    return "Account nicht verbunden — bitte erneut verbinden.";
  }
  if (lower.includes("tidal") && (lower.includes("1002") || lower.includes("unauthorized_client"))) {
    return "Tidal lehnt den Login ab (oft Redirect URI oder Scopes). Settings prüfen.";
  }
  if (lower.includes("spotify api") && lower.includes("401")) {
    return "Spotify-Session abgelaufen — bitte erneut verbinden.";
  }
  if (lower.includes("tidal api") && (lower.includes("401") || lower.includes("403"))) {
    return "Tidal-Session abgelaufen — bitte erneut verbinden.";
  }
  if (lower.includes("404") && lower.includes("tidal")) {
    return "Tidal-Playlist/API nicht gefunden — Endpoint oder Rechte prüfen.";
  }
  if (lower.includes("forbidden") || lower.includes("403")) {
    return "Zugriff verweigert — Scopes oder Account-Rechte prüfen.";
  }
  if (lower.includes("rate limit") || lower.includes("429")) {
    return "API-Limit erreicht (429) — Tidal/Spotify bittet um eine kurze Pause. Bitte in ein paar Minuten erneut versuchen.";
  }
  if (
    lower.includes("invalid include path") ||
    (lower.includes("generic_request_error") && lower.includes("include"))
  ) {
    return "Alte Tidal-Suche (falscher include-Pfad). Bitte diesen Sync jetzt erneut starten.";
  }
  if (lower.includes("failed query") || lower.includes("track_matches")) {
    return "Sync abgebrochen: ein Titel hatte keine gültige Dauer. Bitte den Lauf erneut starten.";
  }
  if (lower.includes("sicherheitsabbruch") || lower.includes("leere trackliste")) {
    return "Sync gestoppt, weil eine Seite leer zurückkam. Eine neue leere Ziel-Playlist wird beim nächsten Lauf normal befüllt.";
  }
  if (lower.includes("notbremse") || lower.includes("zurückgehalten")) {
    return "Lösch-Notbremse: Massenlöschung gestoppt — bitte in Details manuell freigeben.";
  }

  // Strip huge JSON blobs / stack noise
  if (raw.length > 220) return `${raw.slice(0, 200)}…`;
  return raw;
}

export function errorSuggestsReconnect(message: string): "spotify" | "tidal" | null {
  const lower = message.toLowerCase();
  if (lower.includes("spotify") && (lower.includes("verbind") || lower.includes("session") || lower.includes("401"))) {
    return "spotify";
  }
  if (lower.includes("tidal") && (lower.includes("verbind") || lower.includes("session") || lower.includes("401") || lower.includes("1002"))) {
    return "tidal";
  }
  return null;
}
