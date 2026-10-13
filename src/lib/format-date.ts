export function formatRelativeTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "Noch nie";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "Unbekannt";

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 45) return "Gerade eben";
  if (diffMin < 60) return `Vor ${diffMin} Min.`;
  if (diffHours === 1) return "Vor 1 Stunde";
  if (diffHours < 24) return `Vor ${diffHours} Stunden`;
  if (diffDays === 1) {
    const time = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    return `Gestern um ${time}`;
  }
  if (diffDays < 7) return `Vor ${diffDays} Tagen`;

  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getPlaylistWebUrl(
  service: "spotify" | "tidal",
  id?: string | null,
  storedUrl?: string | null,
): string {
  if (storedUrl && storedUrl.startsWith("http")) return storedUrl;
  if (!id) {
    return service === "spotify" ? "https://open.spotify.com" : "https://listen.tidal.com";
  }
  if (service === "spotify") {
    return `https://open.spotify.com/playlist/${id}`;
  }
  return `https://tidal.com/browse/playlist/${id}`;
}
