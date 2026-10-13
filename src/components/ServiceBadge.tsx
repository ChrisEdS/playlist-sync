export function ServiceBadge({
  service,
  label,
}: {
  service: "spotify" | "spotify_2" | "tidal";
  label?: string;
}) {
  const isSpotify1 = service === "spotify";
  const isSpotify2 = service === "spotify_2";

  if (isSpotify2) {
    return (
      <span
        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border border-[var(--spotify)]/40"
        style={{
          background: "rgba(30,215,96,0.22)",
          color: "var(--accent)",
        }}
      >
        {label || "Spotify 2"}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{
        background: isSpotify1 ? "rgba(30,215,96,0.15)" : "rgba(0,212,255,0.15)",
        color: isSpotify1 ? "var(--spotify)" : "var(--tidal)",
      }}
    >
      {label || (isSpotify1 ? "Spotify" : "Tidal")}
    </span>
  );
}
