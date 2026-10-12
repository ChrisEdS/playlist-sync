"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ServiceBadge } from "@/components/ServiceBadge";
import { useStatus } from "@/hooks/useStatus";

function SettingsInner() {
  const { data, refresh } = useStatus(5000);
  const params = useSearchParams();
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) setNotice(`${connected} connected`);
    if (error) setNotice(`Error: ${error}`);
    refresh();
  }, [params, refresh]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl p-6 md:p-10">
        <h1
          className="text-3xl font-semibold"
          style={{ fontFamily: "var(--font-syne), sans-serif" }}
        >
          Profile & Connections
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Connect Spotify and Tidal once. Tokens stay encrypted in your Neon database.
        </p>

        {notice ? (
          <p className="mt-4 rounded-2xl border border-[var(--border)] bg-black/30 px-4 py-3 text-sm">
            {notice}
          </p>
        ) : null}

        <div className="mt-8 space-y-4">
          <ConnectionCard
            service="spotify"
            connected={Boolean(data?.connections.spotify.connected)}
            name={data?.connections.spotify.displayName}
          />
          <ConnectionCard
            service="tidal"
            connected={Boolean(data?.connections.tidal.connected)}
            name={data?.connections.tidal.displayName}
          />
        </div>

        <div className="mt-10 rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-5">
          <h2 className="font-semibold">Sync schedule</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Vercel Cron hits <code className="text-[var(--accent)]">/api/cron/sync</code> daily
            (04:00 UTC on Hobby; Pro can run every 15 minutes) and reconciles enabled pairs. Use
            Sync now anytime.
          </p>
        </div>

        <button
          onClick={logout}
          className="mt-8 rounded-2xl border border-[var(--border)] px-4 py-3 text-sm hover:border-[var(--danger)]"
        >
          Lock instance
        </button>
      </div>
    </AppShell>
  );
}

function ConnectionCard({
  service,
  connected,
  name,
}: {
  service: "spotify" | "tidal";
  connected: boolean;
  name?: string | null;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-3">
          <ServiceBadge service={service} />
          <span className="text-sm text-[var(--muted)]">
            {connected ? "Connected" : "Not connected"}
          </span>
        </div>
        <p className="mt-2 text-lg font-medium">{name || (connected ? "Account linked" : "—")}</p>
      </div>
      <a
        href={`/api/auth/${service}`}
        className="rounded-2xl bg-white px-4 py-3 text-center text-sm font-semibold text-black"
      >
        {connected ? "Reconnect" : "Connect"}
      </a>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsInner />
    </Suspense>
  );
}
