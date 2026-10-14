"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ServiceBadge } from "@/components/ServiceBadge";
import { useStatus } from "@/hooks/useStatus";
import { DONATION_LABEL, DONATION_URL } from "@/lib/donation";
import { errorSuggestsReconnect, formatApiError } from "@/lib/format-error";

const DEVELOPER_APPS = {
  spotify: {
    label: "Spotify Developer Dashboard",
    url: "https://developer.spotify.com/dashboard",
    scopes: [
      "playlist-read-private",
      "playlist-read-collaborative",
      "playlist-modify-public",
      "playlist-modify-private",
      "user-library-read",
    ],
    scopeHint: "Spotify fragt diese Scopes beim Connect an (kein Dashboard-Toggle nötig).",
  },
  tidal: {
    label: "Tidal Developer Portal",
    url: "https://developer.tidal.com/dashboard",
    scopes: [
      "playlists.read",
      "playlists.write",
      "collection.read",
      "collection.write",
      "search.read",
      "user.read",
    ],
    scopeHint: "In der Tidal Developer App genau diese Scopes aktivieren — sonst Error 1002.",
  },
} as const;

type CredStatus = {
  configured: boolean;
  source: string;
  clientIdHint: string;
  hasSecret: boolean;
};

type CredsPayload = {
  credentials: { spotify: CredStatus; tidal: CredStatus };
  redirectUris: { spotify: string; tidal: string };
  dashboards: { spotify: string; tidal: string };
};

function SettingsInner() {
  const { data, refresh } = useStatus(5000);
  const params = useSearchParams();
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [creds, setCreds] = useState<CredsPayload | null>(null);

  const loadCreds = useCallback(async () => {
    const res = await fetch("/api/settings/credentials");
    if (res.ok) setCreds(await res.json());
  }, []);

  useEffect(() => {
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected === "spotify") setNotice("Spotify (Hauptaccount) verbunden.");
    else if (connected === "spotify_2") setNotice("Spotify (Zweitaccount) erfolgreich verbunden.");
    else if (connected === "tidal") setNotice("Tidal verbunden.");
    else if (connected) setNotice(`${connected} verbunden.`);
    if (error === "spotify_credentials_missing") {
      setNotice("Bitte zuerst Spotify Client ID & Secret speichern.");
    } else if (error === "tidal_credentials_missing") {
      setNotice("Bitte zuerst Tidal Client ID speichern.");
    } else if (error) {
      setNotice(formatApiError(error));
    }
    refresh();
    loadCreds();
  }, [params, refresh, loadCreds]);

  const pinDisabled = Boolean(data?.setup?.pinDisabled);
  const reconnectHint = notice ? errorSuggestsReconnect(notice) : null;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl p-6 md:p-10">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Einstellungen</p>
        <h1
          className="mt-2 text-3xl font-semibold"
          style={{ fontFamily: "var(--font-syne), sans-serif" }}
        >
          Verbindungen
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Zuerst Developer-App-Keys eintragen, dann Spotify und Tidal verbinden. Secrets werden
          verschlüsselt in Neon gespeichert.
        </p>

        {notice ? (
          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-black/40 px-4 py-3 text-sm">
            <p>{notice}</p>
            {reconnectHint ? (
              <a
                href={`/api/auth/${reconnectHint}`}
                className="mt-2 inline-block text-[var(--spotify)] underline-offset-2 hover:underline"
              >
                {reconnectHint === "spotify" ? "Spotify erneut verbinden" : "Tidal erneut verbinden"} ↗
              </a>
            ) : null}
          </div>
        ) : null}

        <ol className="mt-8 space-y-3 text-sm text-[var(--muted)]">
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--bg-panel)] text-xs text-white">
              1
            </span>
            <span>
              Developer App anlegen und Redirect URI eintragen —{" "}
              <a
                href={DEVELOPER_APPS.spotify.url}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--spotify)] underline-offset-2 hover:underline"
              >
                Spotify Dashboard ↗
              </a>
              {" · "}
              <a
                href={DEVELOPER_APPS.tidal.url}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--tidal)] underline-offset-2 hover:underline"
              >
                Tidal Portal ↗
              </a>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--bg-panel)] text-xs text-white">
              2
            </span>
            Client ID (und Secret) hier speichern
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--bg-panel)] text-xs text-white">
              3
            </span>
            Mit „Connect“ den Account verknüpfen
          </li>
        </ol>

        <div className="mt-8 space-y-6">
          <ProviderSetup
            service="spotify"
            title="Spotify (Hauptaccount)"
            connected={Boolean(data?.connections.spotify.connected)}
            accountName={data?.connections.spotify.displayName}
            status={creds?.credentials.spotify}
            redirectUri={creds?.redirectUris.spotify}
            requireSecret
            onSaved={() => {
              loadCreds();
              refresh();
            }}
          />

          {/* Spotify Secondary Account Card */}
          <section className="rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <ServiceBadge service="spotify" />
                  <StatusPill
                    ok={Boolean(data?.connections.spotify_2?.connected)}
                    label={
                      data?.connections.spotify_2?.connected
                        ? "Account 2 verbunden"
                        : "Account 2 nicht verbunden"
                    }
                  />
                  <span className="text-xs text-[var(--accent)] font-medium">
                    Für Spotify ↔ Spotify Sync
                  </span>
                </div>
                <h2 className="mt-3 text-xl font-semibold">Spotify (Zweitaccount)</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {data?.connections.spotify_2?.connected
                    ? data.connections.spotify_2.displayName || "Account 2 verknüpft"
                    : "Verbinde ein zweites Spotify-Konto, um Playlists zwischen zwei Spotify-Profilen zu synchronisieren"}
                </p>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Nutzt dieselben Developer-Keys wie oben. Beim Verbinden öffnet Spotify die Kontoauswahl.
                </p>
              </div>

              {creds?.credentials.spotify.configured ? (
                <div className="flex flex-wrap items-center gap-3">
                  {data?.connections.spotify_2?.connected ? (
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch("/api/connections/spotify_2", { method: "DELETE" });
                        refresh();
                      }}
                      className="text-sm text-[var(--danger)] hover:underline"
                    >
                      Account 2 trennen
                    </button>
                  ) : null}
                  <a
                    href="/api/auth/spotify?account=spotify_2"
                    className="inline-flex items-center justify-center rounded-2xl bg-[var(--spotify)] px-5 py-3 text-sm font-semibold text-black hover:brightness-110 transition"
                  >
                    {data?.connections.spotify_2?.connected
                      ? "Account 2 wechseln"
                      : "Zweiten Account verbinden"}
                  </a>
                </div>
              ) : (
                <span className="rounded-2xl border border-[var(--border)] px-5 py-3 text-sm text-[var(--muted)]">
                  Zuerst Spotify-Keys oben speichern
                </span>
              )}
            </div>
          </section>

          <ProviderSetup
            service="tidal"
            title="Tidal"
            connected={Boolean(data?.connections.tidal.connected)}
            accountName={data?.connections.tidal.displayName}
            status={creds?.credentials.tidal}
            redirectUri={creds?.redirectUris.tidal}
            onSaved={() => {
              loadCreds();
              refresh();
            }}
          />
        </div>

        <div className="mt-10 rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-5">
          <h2 className="font-semibold">Sync-Zeitplan</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Cron: <code className="text-[var(--accent)]">/api/cron/sync</code> täglich 04:00 UTC
            (Hobby). Jederzeit „Sync now“ vom Dashboard.
          </p>
          {pinDisabled ? (
            <p className="mt-3 text-xs text-[var(--muted)]">
              App-PIN ist aus (<code className="text-[var(--accent)]">DISABLE_APP_PIN</code>) —
              Zugang über Vercel Authentication.
            </p>
          ) : (
            <p className="mt-3 text-xs text-[var(--muted)]">
              Optional: mit Vercel Deployment Protection{" "}
              <code className="text-[var(--accent)]">DISABLE_APP_PIN=1</code> setzen.
            </p>
          )}
        </div>

        <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-5">
          <h2 className="font-semibold">Projekt unterstützen</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Playlist Sync ist Open Source und kostenlos. Eine Spende hilft bei Weiterentwicklung und
            Hosting-Kosten.
          </p>
          <a
            href={DONATION_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[linear-gradient(120deg,#1ed760,#e8ff6b)] px-5 py-2.5 text-sm font-semibold text-black hover:brightness-110 transition"
          >
            <span aria-hidden>♥</span>
            {DONATION_LABEL}
          </a>
        </div>

        {!pinDisabled ? (
          <button
            onClick={logout}
            className="mt-8 rounded-2xl border border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)] hover:border-[var(--danger)] hover:text-white"
          >
            Instanz sperren
          </button>
        ) : null}
      </div>
    </AppShell>
  );
}

function ProviderSetup({
  service,
  title,
  connected,
  accountName,
  status,
  redirectUri,
  requireSecret,
  onSaved,
}: {
  service: "spotify" | "tidal";
  title: string;
  connected: boolean;
  accountName?: string | null;
  status?: CredStatus;
  redirectUri?: string;
  requireSecret?: boolean;
  onSaved: () => void;
}) {
  const developerApp = DEVELOPER_APPS[service];
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const fallbackRedirect =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/auth/${service}/callback`
      : "";
  const effectiveRedirect = redirectUri || fallbackRedirect;

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedOk(false);
    try {
      const res = await fetch("/api/settings/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: service,
          clientId,
          clientSecret: clientSecret || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(formatApiError(json.error || "Speichern fehlgeschlagen"));
      setClientId("");
      setClientSecret("");
      setSavedOk(true);
      onSaved();
    } catch (err) {
      setError(formatApiError(err, "Speichern fehlgeschlagen"));
    } finally {
      setSaving(false);
    }
  }

  async function copyRedirect() {
    if (!effectiveRedirect) return;
    await navigator.clipboard.writeText(effectiveRedirect);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const canConnect = Boolean(status?.configured);

  return (
    <section className="rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)] p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <ServiceBadge service={service} />
            <StatusPill
              ok={connected}
              label={connected ? "Account verbunden" : "Account nicht verbunden"}
            />
            <StatusPill
              ok={Boolean(status?.configured)}
              label={status?.configured ? "App-Keys gespeichert" : "App-Keys fehlen"}
            />
          </div>
          <h2 className="mt-3 text-xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {connected
              ? accountName || "Account verknüpft"
              : status?.configured
                ? `Keys bereit${status.clientIdHint ? ` (${status.clientIdHint})` : ""}`
                : "Keys eintragen, dann verbinden"}
          </p>
          <a
            href={developerApp.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm underline-offset-2 hover:underline"
            style={{ color: service === "spotify" ? "var(--spotify)" : "var(--tidal)" }}
          >
            {developerApp.label} ↗
          </a>
        </div>
        {canConnect ? (
          <a
            href={`/api/auth/${service}`}
            className="inline-flex items-center justify-center rounded-2xl bg-[var(--spotify)] px-5 py-3 text-sm font-semibold text-black hover:brightness-110"
            style={
              service === "tidal"
                ? { background: "var(--tidal)", color: "#041018" }
                : undefined
            }
          >
            {connected ? "Erneut verbinden" : "Account verbinden"}
          </a>
        ) : (
          <span className="rounded-2xl border border-[var(--border)] px-5 py-3 text-sm text-[var(--muted)]">
            Verbinden nach Key-Save
          </span>
        )}
      </div>

      <div className="mt-6 grid gap-4 border-t border-[var(--border)] pt-5">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Redirect URI</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <code className="flex-1 break-all rounded-xl border border-[var(--border)] bg-black/40 px-3 py-2 text-xs text-[var(--accent)]">
              {effectiveRedirect || "lädt…"}
            </code>
            <button
              type="button"
              onClick={copyRedirect}
              disabled={!effectiveRedirect}
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm hover:border-white disabled:opacity-40"
            >
              {copied ? "Kopiert" : "Kopieren"}
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            In der{" "}
            <a
              href={developerApp.url}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
              style={{ color: service === "spotify" ? "var(--spotify)" : "var(--tidal)" }}
            >
              Developer App
            </a>{" "}
            als Redirect URI eintragen.
          </p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
            Required scopes
          </p>
          <p className="mt-1.5 text-xs text-[var(--muted)]">{developerApp.scopeHint}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {developerApp.scopes.map((scope) => (
              <li
                key={scope}
                className="rounded-lg border border-[var(--border)] bg-black/40 px-2 py-1 font-mono text-[11px] text-[var(--accent)]"
              >
                {scope}
              </li>
            ))}
          </ul>
        </div>

        <form onSubmit={save} className="grid gap-3">
          <label className="block text-sm text-[var(--muted)]">
            Client ID
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder={
                status?.clientIdHint ? `Gespeichert: ${status.clientIdHint}` : "Client ID einfügen"
              }
              autoComplete="off"
              className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-white outline-none focus:border-[var(--spotify)]"
              required
            />
          </label>
          <label className="block text-sm text-[var(--muted)]">
            Client Secret{requireSecret ? "" : " (optional)"}
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={
                status?.hasSecret ? "Gespeichert — neu eingeben zum Ersetzen" : "Client Secret einfügen"
              }
              autoComplete="new-password"
              className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-white outline-none focus:border-[var(--spotify)]"
              required={Boolean(requireSecret && !status?.hasSecret)}
            />
          </label>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          {savedOk ? <p className="text-sm text-[var(--progress)]">Gespeichert.</p> : null}
          <button
            type="submit"
            disabled={saving || !clientId.trim()}
            className="justify-self-start rounded-2xl bg-white px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
          >
            {saving ? "Speichern…" : status?.configured ? "Keys aktualisieren" : "Keys speichern"}
          </button>
        </form>

        <div className="flex flex-wrap gap-3">
          {connected ? (
            <button
              type="button"
              onClick={async () => {
                await fetch(`/api/connections/${service}`, { method: "DELETE" });
                onSaved();
              }}
              className="text-sm text-[var(--danger)] hover:underline"
            >
              Account trennen
            </button>
          ) : null}
          {status?.configured ? (
            <button
              type="button"
              onClick={async () => {
                if (!confirm("Gespeicherte Developer-Keys für diesen Dienst löschen?")) return;
                await fetch(`/api/settings/credentials/${service}`, { method: "DELETE" });
                onSaved();
              }}
              className="text-sm text-[var(--muted)] hover:text-white hover:underline"
            >
              Keys löschen
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs"
      style={{
        background: ok ? "rgba(46,229,157,0.12)" : "rgba(255,92,122,0.12)",
        color: ok ? "var(--progress)" : "var(--danger)",
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: ok ? "var(--progress)" : "var(--danger)" }}
      />
      {label}
    </span>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsInner />
    </Suspense>
  );
}
