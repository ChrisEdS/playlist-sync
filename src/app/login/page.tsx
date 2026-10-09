"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Falscher PIN");
      return;
    }
    router.replace(params.get("next") || "/dashboard");
  }

  return (
    <main className="min-h-screen grid place-items-center px-6">
      <form
        onSubmit={onSubmit}
        className="rise w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--bg-panel)]/90 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
      >
        <p
          className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]"
          style={{ fontFamily: "var(--font-syne), sans-serif" }}
        >
          Private instance
        </p>
        <h1
          className="mt-3 text-4xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-syne), sans-serif" }}
        >
          Music Sync
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Spotify ↔ Tidal Voll-Sync. Gib deinen Instance-PIN ein.
        </p>
        <label className="mt-8 block text-sm text-[var(--muted)]">
          PIN
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
            className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 outline-none focus:border-[var(--spotify)]"
          />
        </label>
        {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
        <button
          type="submit"
          disabled={loading || !pin}
          className="mt-6 w-full rounded-2xl bg-[linear-gradient(120deg,#1ed760,#e8ff6b)] px-4 py-3 font-semibold text-black disabled:opacity-50"
        >
          {loading ? "…" : "Unlock"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
