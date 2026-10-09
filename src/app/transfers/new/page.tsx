"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ServiceBadge } from "@/components/ServiceBadge";

type Playlist = {
  id: string;
  name: string;
  trackCount: number;
  imageUrl?: string;
  url?: string;
};

export default function NewTransferPage() {
  const router = useRouter();
  const [source, setSource] = useState<"spotify" | "tidal">("spotify");
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [targets, setTargets] = useState<Playlist[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const [createTarget, setCreateTarget] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [srcRes, tgtRes] = await Promise.all([
          fetch(`/api/playlists/${source}`),
          fetch(`/api/playlists/${source === "spotify" ? "tidal" : "spotify"}`),
        ]);
        if (!srcRes.ok) throw new Error(await srcRes.text());
        if (!tgtRes.ok) throw new Error(await tgtRes.text());
        const srcJson = await srcRes.json();
        const tgtJson = await tgtRes.json();
        if (cancelled) return;
        setPlaylists(srcJson.playlists || []);
        setTargets(tgtJson.playlists || []);
        setSelected("");
        setTargetId("");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load playlists");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [source]);

  async function submit() {
    const playlist = playlists.find((p) => p.id === selected);
    if (!playlist) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/pairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          sourcePlaylistId: playlist.id,
          sourcePlaylistName: playlist.name,
          sourcePlaylistUrl: playlist.url,
          coverImage: playlist.imageUrl,
          createTarget,
          targetPlaylistId: createTarget ? undefined : targetId || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start transfer");
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl p-6 md:p-10">
        <h1
          className="text-3xl font-semibold"
          style={{ fontFamily: "var(--font-syne), sans-serif" }}
        >
          New transfer
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Pick a source playlist. We create or link the counterpart and start Voll-Sync.
        </p>

        <div className="mt-8 flex gap-3">
          {(["spotify", "tidal"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`rounded-2xl border px-4 py-3 ${
                source === s
                  ? "border-[var(--spotify)] bg-[var(--bg-panel)]"
                  : "border-[var(--border)]"
              }`}
            >
              <ServiceBadge service={s} /> <span className="ml-2 text-sm">as source</span>
            </button>
          ))}
        </div>

        {loading ? (
          <p className="mt-8 text-[var(--muted)]">Loading playlists…</p>
        ) : (
          <div className="mt-8 space-y-3 max-h-[420px] overflow-auto pr-1">
            {playlists.map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center gap-4 rounded-2xl border p-4 ${
                  selected === p.id
                    ? "border-[var(--spotify)] bg-[var(--bg-panel)]"
                    : "border-[var(--border)]"
                }`}
              >
                <input
                  type="radio"
                  name="playlist"
                  checked={selected === p.id}
                  onChange={() => setSelected(p.id)}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-[#222]" />
                )}
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-sm text-[var(--muted)]">{p.trackCount} tracks</div>
                </div>
              </label>
            ))}
            {!playlists.length ? (
              <p className="text-[var(--muted)]">
                No playlists found. Connect the service under Profile first.
              </p>
            ) : null}
          </div>
        )}

        <div className="mt-8 rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-5">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={createTarget}
              onChange={(e) => setCreateTarget(e.target.checked)}
            />
            Create matching playlist on the other service
          </label>
          {!createTarget ? (
            <select
              className="mt-4 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">Select existing playlist…</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.trackCount})
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}

        <button
          disabled={!selected || submitting || (!createTarget && !targetId)}
          onClick={submit}
          className="mt-8 rounded-2xl bg-[linear-gradient(120deg,#1ed760,#e8ff6b)] px-5 py-3 font-semibold text-black disabled:opacity-40"
        >
          {submitting ? "Starting…" : "Start sync"}
        </button>
      </div>
    </AppShell>
  );
}
