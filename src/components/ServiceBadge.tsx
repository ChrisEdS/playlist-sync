export function ServiceBadge({ service }: { service: "spotify" | "tidal" }) {
  const isSpotify = service === "spotify";
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{
        background: isSpotify ? "rgba(30,215,96,0.15)" : "rgba(0,212,255,0.15)",
        color: isSpotify ? "var(--spotify)" : "var(--tidal)",
      }}
    >
      {isSpotify ? "Spotify" : "Tidal"}
    </span>
  );
}
